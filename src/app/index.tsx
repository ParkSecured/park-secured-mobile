import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View, PermissionsAndroid
} from 'react-native';

import { styles } from './styles';


const BleManagerCtor = Platform.OS === 'web' ? null : require('react-native-ble-plx').BleManager;
const bleManager = BleManagerCtor ? new BleManagerCtor() : null;
const PARKSECURED_SERVICE_UUID = '0000ABCD-0000-1000-8000-00805F9B34FB';
const PARKSECURED_CHAR_UUID = '00001234-0000-1000-8000-00805F9B34FB';

const CLOUD_URL = process.env.EXPO_PUBLIC_CLOUD_URL
  ?? Constants.expoConfig?.extra?.cloudUrl
  ?? 'https://park-secured-cloud-r62j.onrender.com/api';
const PENDING_POLL_INTERVAL = 1000;
const PENDING_TIMEOUT = 60000;

interface AuditLog {
  event_id: number;
  event_type: string;
  event_status: string;
  gate_code: string;
  notes: string;
  event_time?: string;
}

interface Profil {
  numeComplet: string;
  legitimatie: string;
  orarPermis: string;
  divizie: string;
  colegi: { name: string }[];
  acordatDe: string;
  codBluetooth: string;
  accessStartTime: string | null;
  accessEndTime: string | null;
}

export default function HomeScreen() {
  const [email, setEmail] = useState("operator.demo@parksecure.local");
  const [parola, setParola] = useState("admin123");
  const [isAutentificat, setIsAutentificat] = useState(false);
  const [accessSeedSalvat, setAccessSeedSalvat] = useState<string | null>(null);
  const [statusMesaj, setStatusMesaj] = useState("Se inițializează identificatorul hardware...");
  const [deviceUuid, setDeviceUuid] = useState<string>("");
  const [numeAngajat, setNumeAngajat] = useState("");
  const [rolAngajat, setRolAngajat] = useState("");
  const [orarAcces, setOrarAcces] = useState("Se încarcă...");
  const [orarAngajat, setOrarAngajat] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [pendingState, setPendingState] = useState<{ active: boolean; tip: 'ENTRY' | 'EXIT' | null }>({ active: false, tip: null });
  const isPending = pendingState.active;
  const pendingTipActiune = pendingState.tip;
  const [ultimAprobatDe, setUltimAprobatDe] = useState<string | null>(null);

  const [tabActiv, setTabActiv] = useState<'acces' | 'profil' | 'prezenta'>('acces');
  const [modAcces, setModAcces] = useState<'pieton' | 'masina'>('pieton');

  // Schimbare parolă la prima logare
  const [trebuieSchimbareParola, setTrebuieSchimbareParola] = useState(false);
  const [parolaNoua, setParolaNoua] = useState('');
  const [parolaConfirm, setParolaConfirm] = useState('');
  const [schimbareLoading, setSchimbareLoading] = useState(false);

  // Tab Profil
  const [profil, setProfil] = useState<Profil | null>(null);
  const [profilLoading, setProfilLoading] = useState(false);

  // Tab Prezență
  const [evenimentePrezenta, setEvenimentePrezenta] = useState<AuditLog[]>([]);
  const [prezentaLoading, setPrezentaLoading] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollIntervalRef.current = null;
    pollTimeoutRef.current = null;
  };

  const esteInAfaraOrarului = (): boolean => {
    const startRaw = orarAngajat.start ?? profil?.accessStartTime;
    const endRaw = orarAngajat.end ?? profil?.accessEndTime;
    if (!startRaw || !endRaw) return false;
    const toSec = (t: string) => {
      const [h, m, s = '0'] = String(t).split(':');
      return Number(h) * 3600 + Number(m) * 60 + Number(s);
    };
    const now = new Date();
    const cur = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const start = toSec(startRaw);
    const end = toSec(endRaw);
    if (start <= end) return cur < start || cur > end;
    return cur < start && cur > end; // interval peste miezul nopții
  };

  // targetName: 'ESP32_Poarta' pentru masina, 'ParkSecured' pentru pieton
  const trimiteBluetoothCode = async (bluetoothCode: string, targetName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!bleManager) {
        reject(new Error('Bluetooth indisponibil pe web'));
        return;
      }

      bleManager.startDeviceScan(
        [PARKSECURED_SERVICE_UUID],
        null,
        async (error: any, device: any) => {
          if (error) {
            reject(error);
            return;
          }
          if (!device) return;

          // Filtreaza dupa nume doar pentru ESP32 (numele Tauri variaza pe Windows)
          const deviceName = device.name || device.localName || '';
          console.log(`[BLE] Gasit dispozitiv: "${deviceName}", caut: "${targetName}"`);
          if (targetName === 'ESP32_Poarta' && deviceName !== 'ESP32_Poarta') return;

          try {
            bleManager.stopDeviceScan();
            const connected = await device.connect();
            await connected.discoverAllServicesAndCharacteristics();
            await connected.writeCharacteristicWithResponseForService(
              PARKSECURED_SERVICE_UUID,
              PARKSECURED_CHAR_UUID,
              btoa(bluetoothCode)
            );
            await connected.cancelConnection();
            resolve();
          } catch (err) {
            bleManager.stopDeviceScan();
            reject(err);
          }
        }
      );

      setTimeout(() => {
        bleManager.stopDeviceScan();
        reject(new Error(`Timeout: ${targetName} nu a fost găsit`));
      }, 10000);
    });
  };


  useEffect(() => {
    return () => stopPolling();
  }, []);

  useEffect(() => {
    async function obtineIdHardware() {
      try {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          ]);
        }
        let idUnic = "";
        if (Platform.OS === 'android') {
          idUnic = Application.getAndroidId() || `android-fallback-${Math.floor(1000 + Math.random() * 9000)}`;
        } else if (Platform.OS === 'ios') {
          const iosId = await Application.getIosIdForVendorAsync();
          idUnic = iosId || `ios-fallback-${Math.floor(1000 + Math.random() * 9000)}`;
        } else {
          idUnic = `web-${Math.random().toString(36).slice(2, 10)}`;
        }
        setDeviceUuid(idUnic);
        setStatusMesaj("Dispozitiv securizat pregătit.");
      } catch (error) {
        setDeviceUuid(`fallback-${Platform.OS}-12345`);
        setStatusMesaj("Eroare inițializare hardware.");
      }
    }
    obtineIdHardware();
  }, []);

  const incarcaProfil = async (seed: string) => {
    setProfilLoading(true);
    try {
      const response = await fetch(`${CLOUD_URL}/mobile/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessSeed: seed })
      });
      const data = await response.json();
      if (data.success && data.data) {
        const { employee } = data.data;
        setProfil({
          numeComplet: `${employee.firstName} ${employee.lastName}`,
          legitimatie: employee.badgeCode || '-',
          orarPermis: `${String(employee.accessStartTime).slice(0,5)} - ${String(employee.accessEndTime).slice(0,5)}`,
          divizie: employee.divisionName || '-',
          colegi: (employee.colleagues || []).map((c: { name: string }) => ({ name: c.name })),
          acordatDe: employee.grantedByName || employee.grantedByEmail || '-',
          codBluetooth: employee.bluetoothCode || '-',
          accessStartTime: employee.accessStartTime || null,
          accessEndTime: employee.accessEndTime || null,
        });
      }
    } catch {
      // ignorăm, utilizatorul poate reîncerca
    } finally {
      setProfilLoading(false);
    }
  };

  const incarcaPrezenta = async (seed: string) => {
    setPrezentaLoading(true);
    try {
      const response = await fetch(`${CLOUD_URL}/mobile/monthly-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessSeed: seed })
      });
      const data = await response.json();
      if (data.success && data.data) {
        const events = data.data.events.map((e: any) => ({
          event_id: e.eventId,
          event_type: e.eventType,
          event_status: e.eventStatus,
          event_time: e.eventTime,
          gate_code: e.gateCode,
          notes: e.notes
        }));
        setEvenimentePrezenta(events);
      }
    } catch {
      // ignorăm
    } finally {
      setPrezentaLoading(false);
    }
  };

  const handleLoginSiInregistrare = async () => {
    if (!email.trim() || !parola.trim()) {
      Alert.alert("Eroare", "Te rugăm să introduci email-ul și parola.");
      return;
    }

    try {
      setStatusMesaj("Se verifică credențialele în Cloud...");
      const response = await fetch(`${CLOUD_URL}/mobile/login-secure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: parola, platform: Platform.OS, deviceIdentifier: deviceUuid })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 403 && data.message?.includes("schimbare")) {
          setStatusMesaj("⏳ Cerere de schimbare dispozitiv trimisă. Așteptați aprobarea HR, apoi reîncercați.");
          Alert.alert(
            "Cerere trimisă",
            "Există deja un dispozitiv înregistrat. HR-ul trebuie să aprobe schimbarea. Reîncercați după aprobare."
          );
          return;
        }
        Alert.alert("Eroare", data.message || "Credențiale incorecte sau dispozitiv blocat.");
        setStatusMesaj("Autentificare eșuată.");
        return;
      }

      const seed = data.accessSeed;
      setAccessSeedSalvat(seed);
      setNumeAngajat(data.user.name);
      setRolAngajat(data.user.role);
      const start = data.user.accessStartTime?.slice(0, 5) || "??:??";
      const end = data.user.accessEndTime?.slice(0, 5) || "??:??";
      setOrarAcces(`${start} - ${end}`);
      setOrarAngajat({ start: data.user.accessStartTime || null, end: data.user.accessEndTime || null });
      setIsAutentificat(true);
      setStatusMesaj("Sesiune activă. Dispozitiv gata.");

      // Încarcă datele pentru celelalte taburi
      incarcaProfil(seed);

      if (data.mustChangePassword) {
        setTrebuieSchimbareParola(true);
      } else {
        Alert.alert("Succes!", `Bine ai venit, ${data.user.name}!`);
      }
    } catch (error) {
      Alert.alert("Eroare rețea", "Nu s-a putut contacta serverul backend.");
    }
  };

  const startPendingPolling = (eventId: number, tipActiune: 'ENTRY' | 'EXIT') => {
    setPendingState({ active: true, tip: tipActiune });
    setStatusMesaj("⏳ Aștept răspunsul portarului...");

    const poll = async () => {
      try {
        const response = await fetch(`${CLOUD_URL}/access-events/${eventId}/status`);
        const data = await response.json();
        const event = data.data;

        if (!event || event.eventStatus === 'PENDING') return;

        stopPolling();
        setPendingState({ active: false, tip: null });

        if (event.eventStatus === 'ALLOWED') {
          const numePortar = event.resolvedByName ? ` ${event.resolvedByName}` : '';
          setUltimAprobatDe(event.resolvedByName || null);
          setStatusMesaj(`✅ ${tipActiune === 'ENTRY' ? 'Intrare' : 'Ieșire'} aprobată${numePortar}.`);
          Alert.alert(
            tipActiune === 'ENTRY' ? "✅ Intrare Permisă" : "✅ Ieșire Permisă",
            `Portarul${numePortar} a aprobat accesul. Poarta se deschide.`
          );
        } else {
          setUltimAprobatDe(null);
          setStatusMesaj("❌ Acces refuzat de portar.");
          Alert.alert("❌ Acces Refuzat", "Portarul a refuzat accesul.");
        }
      } catch {
        // ignorăm erorile de rețea în polling
      }
    };

    pollIntervalRef.current = setInterval(poll, PENDING_POLL_INTERVAL);

    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setPendingState({ active: false, tip: null });
      setStatusMesaj("⏱️ Timp expirat. Niciun răspuns de la portar.");
      Alert.alert("Timp expirat", "Portarul nu a răspuns în timp util. Accesul a fost refuzat automat.");
    }, PENDING_TIMEOUT);
  };

  const handleActionarePoarta = async (tipActiune?: 'ENTRY' | 'EXIT') => {
    if (!accessSeedSalvat) {
      Alert.alert("Eroare Securitate", "Nu aveți o sesiune activă. Conectați-vă mai întâi.");
      return;
    }

    if (isPending) {
      Alert.alert("Așteptare", "O cerere este deja în curs de aprobare.");
      return;
    }

    try {
      setStatusMesaj(modAcces === 'masina'
        ? 'Se trimite codul Bluetooth către poartă...'
        : `Se trimite cerere de ${tipActiune === 'ENTRY' ? 'intrare' : 'ieșire'} către server...`
      );

      // ── Canal principal: BLE ──────────────────────────────────────────────
      // masina → ESP32_Poarta (BLE direct pe hardware)
      // pieton → ParkSecured (aplicatia Tauri de la poarta)
      const bleTarget = modAcces === 'masina' ? 'ESP32_Poarta' : 'ParkSecured';

      if (profil?.codBluetooth && profil.codBluetooth !== '-') {
        try {
          setStatusMesaj(`📡 Se trimite codul Bluetooth către ${bleTarget}...`);
          const bleStartTime = new Date();
          await trimiteBluetoothCode(profil.codBluetooth, bleTarget);
          setStatusMesaj('✅ Cod Bluetooth trimis. Aștept răspuns...');
          // BLE reușit — polling pe ultimul eveniment creat după momentul trimiterii
          // Nu setăm isPending=true imediat — o facem doar dacă primul poll găsește PENDING
          // (adică e în afara intervalului orar și portarul trebuie să decidă)
          let handledEventId: number | null = null;
          let isProcessing = false;
          const pollBle = async () => {
            if (isProcessing) return;
            try {
              const r = await fetch(`${CLOUD_URL}/mobile/latest-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessSeed: accessSeedSalvat })
              });
              const d = await r.json();
              const ev = d.data;
              if (!ev) return;
              if (ev.eventTime && new Date(ev.eventTime) < bleStartTime) return;
              if (handledEventId !== null && ev.eventId === handledEventId) return;
              if (ev.eventStatus === 'PENDING') {
                if (!isPending) {
                  setPendingState({ active: true, tip: tipActiune ?? null });
                }
                return;
              }
              isProcessing = true;
              handledEventId = ev.eventId;
              stopPolling();
              setPendingState({ active: false, tip: null });
              if (ev.eventStatus === 'ALLOWED') {
                const numePortar = ev.resolvedByName ? ` de ${ev.resolvedByName}` : '';
                setUltimAprobatDe(ev.resolvedByName || null);
                const label = tipActiune === 'ENTRY' ? 'Intrare' : tipActiune === 'EXIT' ? 'Ieșire' : 'Acces';
                setStatusMesaj(`✅ ${label} aprobată${numePortar}.`);
                Alert.alert(
                  `✅ ${label} Permisă`,
                  `Acces aprobat${numePortar}. Poarta se deschide.`
                );
              } else {
                setUltimAprobatDe(null);
                setStatusMesaj('❌ Acces refuzat.');
                Alert.alert('❌ Acces Refuzat', 'Accesul a fost refuzat.');
              }
            } catch { /* ignorăm erorile de rețea în polling */ }
          };
          pollIntervalRef.current = setInterval(pollBle, PENDING_POLL_INTERVAL);
          pollTimeoutRef.current = setTimeout(() => {
            stopPolling();
            setPendingState({ active: false, tip: null });
            setStatusMesaj('⏱️ Timp expirat.');
            Alert.alert('Timp expirat', 'Poarta nu a răspuns în timp util. Accesul a fost refuzat automat.');
          }, PENDING_TIMEOUT);
          return; // BLE reușit — nu mai facem HTTP
        } catch {
          // BLE a eșuat — fallback la HTTP
          setStatusMesaj('📶 Bluetooth indisponibil. Se încearcă prin internet...');
        }
      }

      // ── Fallback: HTTP ────────────────────────────────────────────────────
      const response = await fetch(`${CLOUD_URL}/validate-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessSeed: accessSeedSalvat, direction: tipActiune, accessMethod: modAcces })
      });

      const data = await response.json();

      if (data.status === 'PENDING' && data.eventId) {
        setPendingState({ active: true, tip: tipActiune ?? null });
        startPendingPolling(data.eventId, tipActiune);
        return;
      }

      if (!response.ok || !data.authorized) {
        Alert.alert("Acces Refuzat", data.message || "Acces neautorizat.");
        setStatusMesaj("Acces refuzat de server.");
        return;
      }

      setStatusMesaj(`✅ ${tipActiune === 'ENTRY' ? 'Intrare' : 'Ieșire'} confirmată. Poarta se deschide.`);
      Alert.alert(
        tipActiune === 'ENTRY' ? "✅ Intrare Permisă" : "✅ Ieșire Permisă",
        `Bine ai venit, ${data.name || numeAngajat}! Poarta se deschide.`
      );
    } catch (error) {
      Alert.alert("Eroare rețea", "Nu s-a putut contacta serverul backend.");
      setStatusMesaj("Eroare de rețea.");
    }
  };

  const handleDeconectare = () => {
    Alert.alert(
      "Deconectare",
      "Sigur doriți să închideți sesiunea securizată pe acest dispozitiv?",
      [
        { text: "Anulează", style: "cancel" },
        {
          text: "Da, Logout",
          style: "destructive",
          onPress: () => {
            stopPolling();
            setAccessSeedSalvat(null);
            setIsAutentificat(false);
            setNumeAngajat("");
            setRolAngajat("");
            setPendingState({ active: false, tip: null });
            setProfil(null);
            setEvenimentePrezenta([]);
            setTabActiv('acces');
            setStatusMesaj("Sesiune închisă cu succes. Dispozitiv pregătit.");
          }
        }
      ]
    );
  };

  const handleSchimbareParola = async () => {
    if (!parolaNoua || !parolaConfirm) {
      Alert.alert("Eroare", "Completează ambele câmpuri.");
      return;
    }
    if (parolaNoua.length < 8) {
      Alert.alert("Eroare", "Parola trebuie să aibă minim 8 caractere.");
      return;
    }
    if (parolaNoua !== parolaConfirm) {
      Alert.alert("Eroare", "Parolele nu coincid.");
      return;
    }

    setSchimbareLoading(true);
    try {
      const response = await fetch(`${CLOUD_URL}/mobile/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, currentPassword: parola, newPassword: parolaNoua })
      });
      const data = await response.json();

      if (!data.success) {
        Alert.alert("Eroare", data.message || "Nu s-a putut schimba parola.");
        return;
      }

      setTrebuieSchimbareParola(false);
      setParolaNoua('');
      setParolaConfirm('');
      Alert.alert("✅ Parolă schimbată", `Bine ai venit, ${numeAngajat}! Parola a fost actualizată.`);
    } catch {
      Alert.alert("Eroare rețea", "Nu s-a putut contacta serverul.");
    } finally {
      setSchimbareLoading(false);
    }
  };

  // ─── TAB: ACCES ───────────────────────────────────────────────────────────
  const renderTabAcces = () => (
    <ScrollView style={styles.dashboardContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.statusLabel}>Profil Angajat Autentificat</Text>
          <TouchableOpacity onPress={handleDeconectare}>
            <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold' }}>🚪 Deconectare</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.numeText}>👤 {numeAngajat}</Text>
        <Text style={styles.detaliuText}>💼 Rol: <Text style={{ fontWeight: '700' }}>{rolAngajat}</Text></Text>
        <Text style={styles.detaliuText}>⏰ Orar Permis: {orarAcces}</Text>
      </View>

      {ultimAprobatDe && (
        <View style={[styles.card, { borderColor: '#16a34a', borderWidth: 1, backgroundColor: '#f0fdf4' }]}>
          <Text style={{ color: '#166534', fontSize: 13, fontWeight: '600' }}>
            ✅ Ultima intrare aprobată de: <Text style={{ fontWeight: '700' }}>{ultimAprobatDe}</Text>
          </Text>
        </View>
      )}

      {isPending && (
        <View style={[styles.card, { borderColor: '#d97706', borderWidth: 2, backgroundColor: '#fffbeb' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="small" color="#d97706" />
            <View>
              <Text style={{ fontWeight: '700', color: '#92400e', fontSize: 15 }}>
                {modAcces === 'masina'
                  ? '🟡 Acces în afara orarului'
                  : pendingTipActiune === 'ENTRY'
                    ? '🟡 Intrare în afara orarului'
                    : '🟡 Ieșire în afara orarului'}
              </Text>
              <Text style={{ color: '#b45309', fontSize: 13, marginTop: 4 }}>
                Aștept răspunsul portarului... (max 1 minut)
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 0 }}>
        <TouchableOpacity
          onPress={() => setModAcces('pieton')}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            backgroundColor: modAcces === 'pieton' ? '#2563eb' : '#f1f5f9',
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: modAcces === 'pieton' ? '#2563eb' : '#cbd5e1',
          }}
        >
          <Text style={{ fontSize: 20 }}>🚶</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: modAcces === 'pieton' ? '#fff' : '#64748b', marginTop: 2 }}>
            Pieton
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setModAcces('masina')}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            backgroundColor: modAcces === 'masina' ? '#2563eb' : '#f1f5f9',
            alignItems: 'center',
            borderWidth: 1.5,
            borderLeftWidth: 0,
            borderColor: modAcces === 'masina' ? '#2563eb' : '#cbd5e1',
          }}
        >
          <Text style={{ fontSize: 20 }}>🚗</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: modAcces === 'masina' ? '#fff' : '#64748b', marginTop: 2 }}>
            Mașină
          </Text>
        </TouchableOpacity>
      </View>

      {modAcces === 'masina' ? (
        <TouchableOpacity
          style={[styles.butonAcces, { width: '100%', marginBottom: 12, opacity: isPending ? 0.5 : 1 }]}
          onPress={() => handleActionarePoarta()}
          disabled={isPending}
        >
          <Text style={styles.butonText}>🚗 Deschide Poarta</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', width: '100%', gap: 10, marginBottom: 12 }}>
          <TouchableOpacity
            style={[styles.butonAcces, { flex: 1, opacity: isPending ? 0.5 : 1 }]}
            onPress={() => handleActionarePoarta('ENTRY')}
            disabled={isPending}
          >
            <Text style={styles.butonText}>🟢 Intrare Poartă</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.butonAcces, { flex: 1, backgroundColor: '#d97706', shadowColor: '#d97706', opacity: isPending ? 0.5 : 1 }]}
            onPress={() => handleActionarePoarta('EXIT')}
            disabled={isPending}
          >
            <Text style={styles.butonText}>🟠 Ieșire Poartă</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ─── TAB: DATE PROPRII ────────────────────────────────────────────────────
  const renderTabProfil = () => (
    <ScrollView style={styles.dashboardContainer} showsVerticalScrollIndicator={false}>
      {profilLoading ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={{ color: '#6b7280', marginTop: 12 }}>Se încarcă datele...</Text>
        </View>
      ) : profil ? (
        <>
          <View style={styles.card}>
            <Text style={styles.statusLabel}>Date Personale</Text>
            <Text style={styles.numeText}>👤 {profil.numeComplet}</Text>
            <Text style={styles.detaliuText}>🪪 Legitimație: <Text style={{ fontWeight: '700' }}>{profil.legitimatie}</Text></Text>
            <Text style={styles.detaliuText}>🏢 Divizie: <Text style={{ fontWeight: '700' }}>{profil.divizie}</Text></Text>
            <Text style={styles.detaliuText}>⏰ Orar Permis: <Text style={{ fontWeight: '700' }}>{profil.orarPermis}</Text></Text>
            <Text style={styles.detaliuText}>🔵 Cod Bluetooth: <Text style={{ fontWeight: '700', fontFamily: 'monospace' }}>{profil.codBluetooth}</Text></Text>
            <Text style={styles.detaliuText}>✅ Acces acordat de: <Text style={{ fontWeight: '700' }}>{profil.acordatDe}</Text></Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.statusLabel}>Colegi din Divizie</Text>
            {profil.colegi.length === 0 ? (
              <Text style={styles.detaliuText}>Nu există alți colegi în această divizie.</Text>
            ) : (
              profil.colegi.map((coleg, index) => (
                <Text key={index} style={[styles.detaliuText, { paddingVertical: 3 }]}>
                  👥 {coleg.name}
                </Text>
              ))
            )}
          </View>

          <TouchableOpacity
            style={[styles.butonLogin, { marginTop: 4 }]}
            onPress={() => accessSeedSalvat && incarcaProfil(accessSeedSalvat)}
          >
            <Text style={styles.butonText}>🔄 Reîmprospătează</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Text style={{ color: '#6b7280', marginBottom: 16 }}>Nu s-au putut încărca datele.</Text>
          <TouchableOpacity
            style={styles.butonLogin}
            onPress={() => accessSeedSalvat && incarcaProfil(accessSeedSalvat)}
          >
            <Text style={styles.butonText}>Reîncearcă</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ─── TAB: RAPORT PREZENȚĂ ─────────────────────────────────────────────────
  const renderTabPrezenta = () => (
    <ScrollView style={styles.dashboardContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.statsCard}>
        <Text style={styles.statsLabel}>Prezență Luna Curentă</Text>
        <Text style={styles.statsNumar}>⚡ {evenimentePrezenta.length} Mișcări înregistrate</Text>
      </View>

      <TouchableOpacity
        style={[styles.butonLogin, { marginBottom: 12, opacity: prezentaLoading ? 0.6 : 1 }]}
        onPress={() => accessSeedSalvat && incarcaPrezenta(accessSeedSalvat)}
        disabled={prezentaLoading}
      >
        {prezentaLoading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.butonText}>🔄 Vezi prezența mea pe luna curentă</Text>
        }
      </TouchableOpacity>

      <Text style={styles.sectiuneTitlu}>📋 Istoric Intrări / Ieșiri</Text>

      {evenimentePrezenta.length === 0 && !prezentaLoading && (
        <Text style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 20 }}>
          Apasă butonul de mai sus pentru a încărca istoricul.
        </Text>
      )}

      {evenimentePrezenta.map((log) => (
        <View key={log.event_id} style={styles.logCard}>
          <View style={styles.logHeader}>
            <Text style={[styles.badge, log.event_type === 'ENTRY' ? styles.badgeIntrare : styles.badgeIesire]}>
              {log.event_type === 'ENTRY' ? 'INTRARE' : 'IEȘIRE'}
            </Text>
            <Text style={[styles.badge, {
              backgroundColor: log.event_status === 'ALLOWED' ? '#dcfce7' : log.event_status === 'DENIED' ? '#fee2e2' : '#fef3c7',
              color: log.event_status === 'ALLOWED' ? '#15803d' : log.event_status === 'DENIED' ? '#b91c1c' : '#b45309',
            }]}>
              {log.event_status}
            </Text>
            <Text style={styles.gateText}>🚪 {log.gate_code}</Text>
          </View>
          {log.event_time && (
            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>
              🕐 {new Date(log.event_time).toLocaleString('ro-RO')}
            </Text>
          )}
          <Text style={styles.notesText}>{log.notes}</Text>
        </View>
      ))}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.titlu}>ParkSecured MobileID</Text>
      <Text style={styles.subtitlu}>Sistem de Gestiune și Audit Automat</Text>

      {!isAutentificat ? (
        <View style={styles.card}>
          <Text style={styles.statusLabel}>Autentificare Cont Angajat:</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" />
          <TextInput style={styles.input} value={parola} onChangeText={setParola} placeholder="Parolă" secureTextEntry />
          <TouchableOpacity style={styles.butonLogin} onPress={handleLoginSiInregistrare}>
            <Text style={styles.butonText}>Pasul 1: Conectare în Sistem</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Tab Bar */}
          <View style={{
            flexDirection: 'row', width: '100%', backgroundColor: '#fff',
            borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden'
          }}>
            {([
              { key: 'acces', label: '🔑 Acces' },
              { key: 'profil', label: '👤 Date Proprii' },
              { key: 'prezenta', label: '📋 Prezență' },
            ] as const).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={{
                  flex: 1, paddingVertical: 10, alignItems: 'center',
                  backgroundColor: tabActiv === tab.key ? '#2563eb' : '#fff',
                }}
                onPress={() => setTabActiv(tab.key)}
              >
                <Text style={{
                  fontSize: 11, fontWeight: '700',
                  color: tabActiv === tab.key ? '#fff' : '#6b7280'
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tabActiv === 'acces' && renderTabAcces()}
          {tabActiv === 'profil' && renderTabProfil()}
          {tabActiv === 'prezenta' && renderTabPrezenta()}
        </>
      )}

      <Modal visible={trebuieSchimbareParola} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1e293b', marginBottom: 6 }}>🔐 Schimbă parola</Text>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 20 }}>
              Acesta este primul tău login. Trebuie să îți setezi o parolă personală înainte de a continua.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Parolă nouă</Text>
            <TextInput
              style={[styles.input, { marginBottom: 12 }]}
              value={parolaNoua}
              onChangeText={setParolaNoua}
              placeholder="Minim 8 caractere"
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Confirmă parola</Text>
            <TextInput
              style={[styles.input, { marginBottom: 20 }]}
              value={parolaConfirm}
              onChangeText={setParolaConfirm}
              placeholder="Repetă parola nouă"
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.butonLogin, { opacity: schimbareLoading ? 0.6 : 1 }]}
              onPress={handleSchimbareParola}
              disabled={schimbareLoading}
            >
              {schimbareLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.butonText}>Setează parola și continuă</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.statusCard}>
        <Text style={styles.statusText}>ℹ️ Status: {statusMesaj}</Text>
      </View>

      {!isAutentificat && (
        <TouchableOpacity style={[styles.butonAcces, styles.butonDezactivat]} disabled={true}>
          <Text style={styles.butonText}>Așteptare Pasul 1 (Conectare)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
