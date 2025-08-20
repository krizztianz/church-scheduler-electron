# ⛪ Church Scheduler (Electron)

Aplikasi desktop berbasis [Electron](https://www.electronjs.org/) untuk membuat **jadwal petugas bulanan** dengan UI modern, responsif, dan mudah digunakan.

![Church Scheduler Screenshot](./docs/screenshot.png)  
*(tambahkan screenshot UI di sini)*

---

## ✨ Fitur
- UI responsif menggunakan **Bootstrap 5** + **Font Awesome**
- Pop-up modal untuk memilih **bulan** & **tahun**
  - Jika tahun yang dipilih adalah tahun berjalan → bulan sebelum bulan ini otomatis **disabled**
- Dropdown tahun otomatis memuat **tahun ini & tahun depan**
- Support build untuk **Windows (.exe)** dan **Linux (AppImage / tar.gz)**
- Portable (tidak butuh instalasi untuk AppImage & portable .exe)

---

## 📦 Instalasi & Menjalankan

### 1. Clone repository
```bash
git clone https://github.com/krizztianz/church-scheduler-electron.git
cd church-scheduler-electron
```

### 2. Install dependencies
```bash
npm install
```

### 3. Jalankan aplikasi (dev mode)
```bash
npm start
```

---

## 🔨 Build

### Windows
```bash
npm run build:win
```
Output:  
- `dist/ChurchScheduler-<versi>-win.exe` (installer)  
- `dist/ChurchScheduler-<versi>-win-portable.exe` (portable)

### Linux
```bash
npm run build:linux
```
Output:  
- `dist/ChurchScheduler-<versi>-linux-x86_64.AppImage`  
- `dist/ChurchScheduler-<versi>-linux-x64.tar.gz`

> ⚠️ RPM/DEB build dinonaktifkan (opsional), gunakan AppImage atau tar.gz untuk distribusi universal.

---

## 📂 Struktur Proyek
```
church-scheduler/
├─ assets/               # Bootstrap, Font Awesome, dll
├─ build/                # Icon & resource build
├─ dist/                 # Hasil build
├─ main.mjs              # Main process Electron
├─ preload.cjs           # Preload script (contextBridge)
├─ index.html            # UI utama (jadwal)
├─ package.json          # Konfigurasi proyek
└─ README.md
```

---

## ⚙️ Konfigurasi Build (package.json)

- **appId**: `com.kris.churchscheduler`  
- **productName**: `ChurchScheduler`  
- **artifactName**: `${productName}-${version}-${os}-${arch}.${ext}`  
- **Linux target**: `AppImage`, `tar.gz`  
- **Windows target**: `nsis`, `portable`  

---

## 📸 Screenshot
Silakan tambahkan screenshot ke folder `docs/` lalu update link di atas.

---

## 📝 Lisensi
Proyek ini dirilis di bawah lisensi **MIT**.  
Lihat [LICENSE](./LICENSE) untuk detail.

---

## 🙏 Kontributor
- **Kris** – Developer utama
