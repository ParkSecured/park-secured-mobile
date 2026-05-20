import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const [statusMesaj, setStatusMesaj] = useState("Dispozitiv securizat conectat");

  const handleTrimiteCod = async () => {
    try {
      setStatusMesaj("Se transmite semnatura dispozitivului...");

      // Citim identificatorul unic al acestui telefon (Hardcodat pentru test ca fiind cel aprobat in baza de date)
      const deviceUuid = "iphone-teodora"; 

      const response = await fetch('http://172.20.10.4:5001/api/validate-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIdentifier: deviceUuid }), // Trimitem DOAR ID-ul telefonului!
      });

      const data = await response.json();

      if (response.ok && data.authorized) {
        Alert.alert("Acces Permis", `🟢 Dispozitiv recunoscut!\nBine ai venit, ${data.name}!`);
        setStatusMesaj("Poarta deblocata cu succes!");
      } else {
        Alert.alert("Acces Respins", data.message || "Dispozitivul nu are permisiune.");
        setStatusMesaj("Acces interzis!");
      }
    } catch (error) {
      Alert.alert("Eroare", "Nu s-a putut contacta serverul.");
      setStatusMesaj("Eroare de retea.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titlu}>ParkSecured MobileID</Text>
      <Text style={styles.subtitlu}>Sistem de Validare prin Dispozitiv Asociat</Text>
      
      <View style={styles.card}>
        <Text style={styles.statusLabel}>Status Telefon:</Text>
        <Text style={styles.statusAprobat}>🟢 AUTORIZAT & INREGISTRAT</Text>
        <Text style={styles.infoText}>Acest iPhone este legat unic de contul tau de angajat in baza de date centrala.</Text>
        <Text style={styles.statusText}>{statusMesaj}</Text>
      </View>

      <TouchableOpacity style={styles.buton} onPress={handleTrimiteCod}>
        <Text style={styles.butonText}>Atinge pentru Acces</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 20 },
  titlu: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 5 },
  subtitlu: { fontSize: 13, color: '#6b7280', marginBottom: 40, textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 25, borderRadius: 16, width: '100%', alignItems: 'center', marginBottom: 30, borderWidth: 1, borderColor: '#e5e7eb' },
  statusLabel: { fontSize: 12, color: '#9ca3af', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 5 },
  statusAprobat: { fontSize: 16, color: '#059669', fontWeight: 'bold', marginBottom: 15 },
  infoText: { fontSize: 13, color: '#4b5563', textAlign: 'center', marginBottom: 15, lineHeight: 18 },
  statusText: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
  buton: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center' },
  butonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});