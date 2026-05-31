import * as Application from 'expo-application';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { styles } from './styles';

interface AuditLog {
  event_id: number;
  event_type: string;
  event_status: string;
  gate_code: string;
  notes: string;
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
  const [orarAcces] = useState("08:00 - 17:00");
  const [istoricAudit, setIstoricAudit] = useState<AuditLog[]>([]);
  const [statisticaPrezență, setStatisticaPrezență] = useState(0);

  useEffect(() => {
    async function obtineIdHardware() {
      try {
        let idUnic = "";
        if (Platform.OS === 'android') {
          idUnic = Application.getAndroidId() || `android-fallback-${Math.floor(1000 + Math.random() * 9000)}`;
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

  const handleLoginSiInregistrare = async () => {
    if (!email.trim() || !parola.trim()) {
      Alert.alert("Eroare", "Te rugăm să introduci email-ul și parola.");
      return;
    }

    try {
      setStatusMesaj("Se verifică credențialele în Cloud...");
      const response = await fetch('https://park-secured-backend.onrender.com/api/mobile/login-secure', {
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

  const handleActionarePoarta = async (tipActiune: 'ENTRY' | 'EXIT') => {
    if (!accessSeedSalvat) {
      Alert.alert("Eroare Securitate", "Nu aveți o sesiune activă. Conectați-vă mai întâi.");
      return;
    }

    try {
      setStatusMesaj(`Se trimite cerere de ${tipActiune === 'ENTRY' ? 'intrare' : 'ieșire'} către server...`);

      const response = await fetch('https://park-secured-backend.onrender.com/api/validate-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessSeed: accessSeedSalvat,
          direction: tipActiune
        })
      });

      const data = await response.json();

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

      const nouLog: AuditLog = {
        event_id: Date.now(),
        event_type: tipActiune,
        event_status: "ALLOWED",
        gate_code: "GATE_MAIN",
        notes: `Acces validat prin WiFi (${tipActiune})`
      };
      setIstoricAudit(prev => [nouLog, ...prev]);
      setStatisticaPrezență(prev => prev + 1);

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
            <Text style={styles.detaliuText}>💼 Rol: <Text style={{ fontWeight: '700' }}>{rolAngajat}</Text></Text>
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

      {isAutentificat && (
        <View style={{ flexDirection: 'row', width: '100%', gap: 10 }}>
          <TouchableOpacity
            style={[styles.butonAcces, { flex: 1 }]}
            onPress={() => handleActionarePoarta('ENTRY')}
          >
            <Text style={styles.butonText}>🟢 Intrare Poartă</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.butonAcces, { flex: 1, backgroundColor: '#d97706', shadowColor: '#d97706' }]}
            onPress={() => handleActionarePoarta('EXIT')}
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
