import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const [email, setEmail] = useState("manager.20260521173123@parksecure.local");
  const [parola, setParola] = useState("manager123");
  
  const [isAutentificat, setIsAutentificat] = useState(false);
  const [accessSeedSalvat, setAccessSeedSalvat] = useState<string | null>(null);
  const [statusMesaj, setStatusMesaj] = useState("Dispozitiv nesincronizat. Autentifică-te.");
  const [deviceUuid] = useState(`${Platform.OS}-hw-${Math.floor(10000 + Math.random() * 90000)}`);

  // PASUL 1: Trimite datele la serverul de pe Mac ca SĂ FIE VERIFICATE ACOLO
  const handleLoginSiInregistrare = async () => {
    if (!email.trim() || !parola.trim()) {
      Alert.alert("Eroare", "Te rugăm să introduci email-ul și parola.");
      return;
    }

    try {
      setStatusMesaj("Se verifică credențialele în Cloud...");
      
      // Telefonul doar TRIMITE datele, serverul face magia cu BCrypt și SQL
      const response = await fetch('http://172.20.10.4:5001/api/mobile/login-secure', {
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
        Alert.alert("Eroare", data.message || "Credentiale incorecte.");
        setStatusMesaj("Autentificare eșuată.");
        return;
      }

      setAccessSeedSalvat(data.accessSeed);
      setIsAutentificat(true);
      setStatusMesaj("Sesiune activă. Dispozitiv gata de utilizare.");
      Alert.alert("Succes!", "Sesiune securizată creată în baza de date.");

    } catch (error) {
      Alert.alert("Eroare rețea", "Nu s-a putut contacta serverul backend.");
    }
  };

  // PASUL 2: Trimite seed-ul primit înapoi la server pentru deblocare
  const handleAtingePentruAcces = async () => {
    if (!accessSeedSalvat) return;

    try {
      setStatusMesaj("Se transmite jetonul de sesiune...");

      const response = await fetch('http://172.20.10.4:5001/api/validate-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessSeed: accessSeedSalvat }), 
      });

      const data = await response.json();

      if (response.ok && data.authorized) {
        Alert.alert("Acces Permis", `🟢 Poartă deblocată!\nBine ai venit, ${data.name}!`);
        setStatusMesaj("Poarta a fost deschisă!");
      } else {
        Alert.alert("Acces Respins", data.message || "Sesiune invalidă.");
      }
    } catch (error) {
      Alert.alert("Eroare", "Eroare de rețea locală.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titlu}>ParkSecured MobileID</Text>
      <Text style={styles.subtitlu}>Sistem de Validare Securizată</Text>
      
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
        <View style={styles.card}>
          <Text style={styles.statusLabel}>Sesiune Activă Utilizator:</Text>
          <Text style={styles.emailText}>👤 {email}</Text>
          <Text style={styles.statusLabel}>Token Sesiune (accessSeed):</Text>
          <Text style={styles.seedText}>🔑 {accessSeedSalvat?.substring(0, 32)}...</Text>
        </View>
      )}

      <View style={styles.statusCard}><Text style={styles.statusText}>ℹ️ Status: {statusMesaj}</Text></View>

      <TouchableOpacity style={[styles.butonAcces, !isAutentificat && styles.butonDezactivat]} onPress={handleAtingePentruAcces} disabled={!isAutentificat}>
        <Text style={styles.butonText}>Pasul 2: Atinge pentru Acces</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 20 },
  titlu: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 5 },
  subtitlu: { fontSize: 13, color: '#6b7280', marginBottom: 30, textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, width: '100%', marginBottom: 15, borderWidth: 1, borderColor: '#e5e7eb' },
  statusCard: { width: '100%', padding: 12, backgroundColor: '#eff6ff', borderRadius: 8, marginBottom: 25 },
  statusLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 5, marginTop: 5 },
  input: { width: '100%', height: 45, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, fontSize: 14, marginBottom: 10, backgroundColor: '#f9fafb', color: '#111827' },
  emailText: { fontSize: 14, fontWeight: '600', color: '#059669', marginBottom: 5 },
  seedText: { fontSize: 12, color: '#2563eb', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  statusText: { fontSize: 13, color: '#1d4ed8', fontWeight: '500', textAlign: 'center' },
  butonLogin: { backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 8, width: '100%', alignItems: 'center', marginTop: 5 },
  butonAcces: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center' },
  butonDezactivat: { backgroundColor: '#9ca3af', opacity: 0.6 },
  butonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});