import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

export default function CloseCabinetModal({ visible }: { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}} allowSwipeDismissal={false}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Please close the cabinet door</Text>
          <Text style={styles.message}>Push both drawers fully closed so their magnetic switches connect. This message will disappear automatically once both doors are confirmed closed.</Text>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)' },
  card: { backgroundColor: '#FFF7ED', borderRadius: 20, padding: 26 },
  title: { fontSize: 23, fontWeight: '700', color: '#9A3412', marginBottom: 16 },
  message: { fontSize: 17, lineHeight: 25, color: '#431407' },
});
