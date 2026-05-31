import * as Application from 'expo-application';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';

import { styles } from './styles';

const BACKEND_URL = 'https://park-secured-backend.onrender.com';
const CLOUD_URL = 'https://park-secured-cloud-r62j.onrender.com/api';
const PENDING_POLL_INTERVAL = 3000;
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
  const [isPending, setIsPending] = useState(false);
  const [pendingTipActiune, setPendingTipActiune] = useState<'ENTRY' | 'EXIT' | null>(null);

  // Tab activ: 'acces' | 'profil' | 'prezenta'
  const [tabActiv, setTabActiv] = useState<'acces' | 'profil' | 'prezenta'>('acces');

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

  useEffect(() => {
    return () => stopPolling();
  }, []);

  useEffect(() => {
    async function obtineIdHardware() {
      try {
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
      const response = await fetch(`${BACKEND_URL}/api/mobile/profile?accessSeed=${seed}`);
      const data = await response.json();
      if (data.success) {
        setProfil(data.data);
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
      const response = await fetch(`${BACKEND_URL}/api/mobile/my-events?accessSeed=${seed}`);
      const data = await response.json();
      if (data.success) {
        setEvenimentePrezenta(data.data);
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
      const response = await fetch(`${BACKEND_URL}/api/mobile/login-secure`, {
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
      setIsAutentificat(true);
      setStatusMesaj("Sesiune activă. Dispozitiv gata.");

      // Încarcă datele pentru celelalte taburi
      incarcaProfil(seed);

      Alert.alert("Succes!", `Bine ai venit, ${data.user.name}!`);
    } catch (error) {
      Alert.alert("Eroare rețea", "Nu s-a putut contacta serverul backend.");
    }
  };

  const startPendingPolling = (eventId: number, tipActiune: 'ENTRY' | 'EXIT') => {
    setIsPending(true);
    setPendingTipActiune(tipActiune);
    setStatusMesaj("⏳ Aștept răspunsul portarului...");

    const poll = async () => {
      try {
        const response = await fetch(`${CLOUD_URL}/access-events/${eventId}/status`);
        const data = await response.json();
        const event = data.data;

        if (!event || event.eventStatus === 'PENDING') return;

        stopPolling();
        setIsPending(false);
        setPendingTipActiune(null);

        if (event.eventStatus === 'ALLOWED') {
          setStatusMesaj(`✅ ${tipActiune === 'ENTRY' ? 'Intrare' : 'Ieșire'} aprobată de portar.`);
          Alert.alert(
            tipActiune === 'ENTRY' ? "✅ Intrare Permisă" : "✅ Ieșire Permisă",
            "Portarul a aprobat accesul. Poarta se deschide."
          );
        } else {
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
      setIsPending(false);
      setPendingTipActiune(null);
      setStatusMesaj("⏱️ Timp expirat. Niciun răspuns de la portar.");
      Alert.alert("Timp expirat", "Portarul nu a răspuns în timp util. Accesul a fost refuzat automat.");
    }, PENDING_TIMEOUT);
  };

  const handleActionarePoarta = async (tipActiune: 'ENTRY' | 'EXIT') => {
    if (!accessSeedSalvat) {
      Alert.alert("Eroare Securitate", "Nu aveți o sesiune activă. Conectați-vă mai întâi.");
      return;
    }

    if (isPending) {
      Alert.alert("Așteptare", "O cerere este deja în curs de aprobare.");
      return;
    }

    try {
      setStatusMesaj(`Se trimite cerere de ${tipActiune === 'ENTRY' ? 'intrare' : 'ieșire'} către server...`);

      const response = await fetch(`${BACKEND_URL}/api/validate-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessSeed: accessSeedSalvat, direction: tipActiune })
      });

      const data = await response.json();

      if (data.status === 'PENDING' && data.eventId) {
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
            setIsPending(false);
            setPendingTipActiune(null);
            setProfil(null);
            setEvenimentePrezenta([]);
            setTabActiv('acces');
            setStatusMesaj("Sesiune închisă cu succes. Dispozitiv pregătit.");
          }
        }
      ]
    );
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

      {isPending && (
        <View style={[styles.card, { borderColor: '#d97706', borderWidth: 2, backgroundColor: '#fffbeb' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="small" color="#d97706" />
            <View>
              <Text style={{ fontWeight: '700', color: '#92400e', fontSize: 15 }}>
                {pendingTipActiune === 'ENTRY' ? '🟡 Intrare în afara orarului' : '🟡 Ieșire în afara orarului'}
              </Text>
              <Text style={{ color: '#b45309', fontSize: 13, marginTop: 4 }}>
                Aștept răspunsul portarului... (max 1 minut)
              </Text>
            </View>
          </View>
        </View>
      )}

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
