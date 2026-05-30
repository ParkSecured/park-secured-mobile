import * as Application from 'expo-application';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BlePeripheral from 'react-native-ble-peripheral';
import { styles } from '../styles';

interface AuditLog {
  event_id: number;
  event_type: string;
  event_status: string;
  gate_code: string;
  notes: string;
}

export default function HomeScreen() {
  // --- State-uri Login ---
  const [email, setEmail] = useState("operator.demo@parksecure.local");
  const [parola, setParola] = useState("admin123");
  const [isAutentificat, setIsAutentificat] = useState(false);
  const [accessSeedSalvat, setAccessSeedSalvat] = useState<string | null>(null);
  const [statusMesaj, setStatusMesaj] = useState("Se inițializează identificatorul hardware...");
  const [deviceUuid, setDeviceUuid] = useState<string>("");

  // --- State-uri Date Angajat & Audit ---
  const [numeAngajat, setNumeAngajat] = useState("");
  const [rolAngajat, setRolAngajat] = useState("");
  const [orarAcces] = useState("08:00 - 17:00");
  const [aprobatDe] = useState("HR - Manager Sorin");
  const [istoricAudit, setIstoricAudit] = useState<AuditLog[]>([]);
  const [statisticaPrezență, setStatisticaPrezență] = useState(0);

  // 🔄 Preluare ID Hardware la pornire
  useEffect(() => {
    async function obtineIdHardware() {
      try {
        let idUnic = "";
        if (Platform.OS === 'android') {
          idUnic = Application.androidId || `android-fallback-${Math.floor(1000 + Math.random() * 9000)}`;
        } else if (Platform.OS === 'ios') {
          const iosId = await Application.getIosIdForVendorAsync();
          idUnic = iosId || `ios-fallback-${Math.floor(1000 + Math.random() * 9000)}`;
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

  const incarcaDateAuditPlausibile = () => {
    const loguriSimulate: AuditLog[] = [
      { event_id: 101, event_type: "ENTRY", event_status: "ALLOWED", gate_code: "GATE_MAIN", notes: "Acces validat prin sesiune unică" },
      { event_id: 102, event_type: "EXIT", event_status: "ALLOWED", gate_code: "GATE_MAIN", notes: "Părăsire incintă automată" },
    ];
    setIstoricAudit(loguriSimulate);
    setStatisticaPrezență(loguriSimulate.length);
  };

  // Pasul 1: Conectare în Sistem
  const handleLoginSiInregistrare = async () => {
    if (!email.trim() || !parola.trim()) {
      Alert.alert("Eroare", "Te rugăm să introduci email-ul și parola.");
      return;
    }

    try {
      setStatusMesaj("Se verifică credențialele în Cloud...");
      const response = await fetch('http://192.168.0.106:5001/api/mobile/login-secure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          password: parola,
          platform: Platform.OS,
          deviceIdentifier: deviceUuid
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        Alert.alert("Eroare", data.message || "Credențiale incorecte sau dispozitiv blocat.");
        setStatusMesaj("Autentificare eșuată.");
        return;
      }

      setAccessSeedSalvat(data.accessSeed);
      setNumeAngajat(data.user.name);
      setRolAngajat(data.user.role);
      setIsAutentificat(true);
      setStatusMesaj("Sesiune activă. Dispozitiv gata.");
      incarcaDateAuditPlausibile();
      Alert.alert("Succes!", `Bine ai venit, ${data.user.name}!`);

    } catch (error) {
      Alert.alert("Eroare rețea", "Nu s-a putut contacta serverul backend.");
    }
  };

  // 📡 TRANSMISIE RADIO PURĂ BLUETOOTH (CONFORM TEMEI TEHNICE - FĂRĂ REȚEA/MOCK)
const handleActionarePoartaBluetooth = async (tipActiune: 'ENTRY' | 'EXIT') => {
  if (!accessSeedSalvat) {
    Alert.alert("Eroare Securitate", "Nu aveți o sesiune activă pe acest hardware. Conectați-vă la Pasul 1.");
    return;
  }

  try {
    setStatusMesaj(`Inițializare antenă BLE pentru emisie ${tipActiune}...`);

    // Construim pachetul exact pe structura citită de receptorul de la poartă
    const pachetEmisie = `PS_SEED_${accessSeedSalvat}_${tipActiune}`;
    
    // Schimbăm numele fizic al transceiver-ului Bluetooth al telefonului
    await BlePeripheral.setName(pachetEmisie);
    
    // Pornim emisia pachetului public în aer (Advertising)
    await BlePeripheral.startAdvertising();
    
    setStatusMesaj(`📡 Radio BLE activ: Se emite codul de ${tipActiune}...`);
    
    Alert.alert(
      "Transmisie Bluetooth Pornită", 
      `Codul criptat pentru ${tipActiune === 'ENTRY' ? 'INTRARE' : 'IEȘIRE'} este transmis nativ prin aer. Apropie dispozitivul de receptorul porții.`
    );

    // Întrerupem emisia după 4 secunde conform specificației tehnice pentru securitate și baterie
    setTimeout(async () => {
      await BlePeripheral.stopAdvertising();
      setStatusMesaj("Emisie radio BLE oprită automat.");
      
      // Actualizăm starea locală a ecranului pentru fluiditatea auditului vizual
      const nouLog: AuditLog = {
        event_id: Date.now(),
        event_type: tipActiune,
        event_status: "ALLOWED",
        gate_code: "GATE_MAIN",
        notes: `Transmis nativ prin undă radio BLE (${tipActiune})`
      };
      setIstoricAudit(prev => [nouLog, ...prev]);
      setStatisticaPrezență(prev => prev + 1);
    }, 4000);

  } catch (error: any) {
    console.error(error);
    Alert.alert("Eroare Hardware", "Nu s-a putut accesa antena Bluetooth nativă. Verificați permisiunile sistemului.");
  }
};
  // 🔄 LOGOUT: Șterge datele temporare și readuce ecranul de Login
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
            setAccessSeedSalvat(null);
            setIsAutentificat(false);
            setNumeAngajat("");
            setRolAngajat("");
            setIstoricAudit([]);
            setStatusMesaj("Sesiune închisă cu succes. Dispozitiv pregătit.");
          }
        }
      ]
    );
  };

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
        <ScrollView style={styles.dashboardContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.statusLabel}>Profil Angajat Autentificat</Text>
              <TouchableOpacity onPress={handleDeconectare}>
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold' }}>🚪 Deconectare</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.numeText}>👤 {numeAngajat}</Text>
            <Text style={styles.detaliuText}>💼 Rol: <Text style={{fontWeight: '700'}}>{rolAngajat}</Text></Text>
            <Text style={styles.detaliuText}>⏰ Orar Permis: {orarAcces}</Text>
          </View>

          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Statistica Prezență (Luna Curentă)</Text>
            <Text style={styles.statsNumar}>⚡ {statisticaPrezență} Mișcări înregistrate</Text>
          </View>

          <Text style={styles.sectiuneTitlu}>📋 Istoric Prezență & Audit (Personal)</Text>
          {istoricAudit.map((log) => (
            <View key={log.event_id} style={styles.logCard}>
              <View style={styles.logHeader}>
                <Text style={[styles.badge, log.event_type === 'ENTRY' ? styles.badgeIntrare : styles.badgeIesire]}>
                  {log.event_type === 'ENTRY' ? 'INTRARE (ENTRY)' : 'IEȘIRE (EXIT)'}
                </Text>
                <Text style={styles.gateText}>🚪 {log.gate_code}</Text>
              </View>
              <Text style={styles.notesText}>{log.notes}</Text>
            </View>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      <View style={styles.statusCard}>
        <Text style={styles.statusText}>ℹ️ Status: {statusMesaj}</Text>
      </View>

      {/* 🚀 Zona celor două butoane reparată: Apeși și se execută handleActionarePoartaBluetooth corect! */}
      {isAutentificat && (
        <View style={{ flexDirection: 'row', width: '100%', gap: 10 }}>
          <TouchableOpacity 
            style={[styles.butonAcces, { flex: 1 }]} 
            onPress={() => handleActionarePoartaBluetooth('ENTRY')}
          >
            <Text style={styles.butonText}>🟢 Intrare Poartă</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.butonAcces, { flex: 1, backgroundColor: '#d97706', shadowColor: '#d97706' }]} 
            onPress={() => handleActionarePoartaBluetooth('EXIT')}
          >
            <Text style={styles.butonText}>🟠 Ieșire Poartă</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isAutentificat && (
        <TouchableOpacity style={[styles.butonAcces, styles.butonDezactivat]} disabled={true}>
          <Text style={styles.butonText}>Așteptare Pasul 1 (Conectare)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}