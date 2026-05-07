#!/bin/bash

# Script Setup Otomatis untuk MIRZA APEX BATTLE
echo "--- MENYIAPKAN PROTOKOL MIRZA APEX BATTLE ---"

# 1. Install dependencies
echo "Menginstall komponen game..."
npm install

# 2. Build aplikasi (opsional untuk produksi)
echo "Membangun sistem optimasi..."
npm run build

# 3. Jalankan server
echo "SISTEM SIAP. Menjalankan game..."
npm run dev
