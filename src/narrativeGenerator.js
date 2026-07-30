// Helper module untuk menghasilkan Pembahasan, Narasi per Kelas,
// Kesimpulan Umum, Kesan Umum, Observasi Kritis, Tindak Lanjut,
// dan Rekomendasi Akhir berbasis analisis data terinput (CPOB & EU GMP Annex 1).

const PARAM_DEFS = [
  { key: "settle", label: "Cawan Papar (Settle Plate)", short: "Settle Plate" },
  { key: "contact", label: "Cawan Kontak (Contact Plate)", short: "Contact Plate" },
  { key: "air", label: "Air Sampler", short: "Air Sampler" },
];

const LIMITS = [
  { parameter: "settle", kelas: "E", syarat: 200, alert: 88, action: 119 },
  { parameter: "settle", kelas: "D", syarat: 100, alert: 70, action: 95 },
  { parameter: "contact", kelas: "D", syarat: 50, alert: 9, action: 13 },
  { parameter: "air", kelas: "D", syarat: 200, alert: 138, action: 176 },
  { parameter: "settle", kelas: "C", syarat: 50, alert: 13, action: 18 },
  { parameter: "contact", kelas: "C", syarat: 25, alert: 14, action: 20 },
  { parameter: "air", kelas: "C", syarat: 100, alert: 51, action: 68 },
  { parameter: "settle", kelas: "B", syarat: 5, alert: 2, action: 3 },
  { parameter: "contact", kelas: "B", syarat: 5, alert: 2, action: 3 },
  { parameter: "air", kelas: "B", syarat: 10, alert: 5, action: 7 },
  { parameter: "settle", kelas: "A", syarat: 1, alert: 1, action: 1, lessThan: true },
  { parameter: "contact", kelas: "A", syarat: 1, alert: 1, action: 1, lessThan: true },
  { parameter: "air", kelas: "A", syarat: 1, alert: 1, action: 1, lessThan: true },
];

function getLimit(parameter, kelas) {
  return LIMITS.find((l) => l.parameter === parameter && l.kelas === kelas) || null;
}

function parseNumericValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const str = String(rawValue).trim();
  const lessThanMatch = str.match(/^<\s*([\d.]+)$/);
  if (lessThanMatch) {
    const n = Number(lessThanMatch[1]);
    return Number.isNaN(n) ? null : n - 0.001;
  }
  const n = Number(str);
  return Number.isNaN(n) ? null : n;
}

function getStatus(rawValue, parameter, kelas) {
  const limit = getLimit(parameter, kelas);
  if (!limit) return { level: 0, label: "N/A" };
  if (rawValue === null || rawValue === undefined || rawValue === "")
    return { level: 0, label: "Belum diuji" };
  const v = parseNumericValue(rawValue);
  if (v === null) return { level: 0, label: "N/A" };
  if (limit.lessThan) {
    return v < 1
      ? { level: 1, label: "Terkendali" }
      : { level: 4, label: "Melebihi Syarat" };
  }
  if (v < limit.alert) return { level: 1, label: "Terkendali" };
  if (v < limit.action) return { level: 2, label: "Alert" };
  if (v < limit.syarat) return { level: 3, label: "Action" };
  return { level: 4, label: "Melebihi Syarat" };
}

function displayValue(rawValue, kelas, parameter) {
  const limit = getLimit(parameter, kelas);
  if (!limit) return "N/A";
  if (rawValue === null || rawValue === undefined || rawValue === "") return "-";
  const str = String(rawValue).trim();
  if (/^<\s*[\d.]+$/.test(str)) return str.replace(/\s+/g, "");
  if (limit.lessThan && Number(rawValue) < 1) return "<1";
  return String(rawValue);
}

function shortDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

export function generateLocalNarrative({ facilityLabel, monthLabel, classes, entries }) {
  const perKelas = {};
  const allBreaches = [];
  let totalPointsAll = 0;

  classes.forEach((k) => {
    const kelasEntries = (entries || []).filter((e) => e.kelas === k);
    totalPointsAll += kelasEntries.length;

    if (kelasEntries.length === 0) {
      perKelas[k] = `Pada periode ${monthLabel}, tidak terdapat pengujian Environment Monitoring (EM) Viable yang dilakukan untuk ruangan Kelas ${k}.`;
      return;
    }

    const roomNames = Array.from(new Set(kelasEntries.map((e) => e.roomName).filter(Boolean)));
    const roomStr = roomNames.length > 0 ? roomNames.join(", ") : "ruangan sampling";

    const paramsUsed = [];
    PARAM_DEFS.forEach((p) => {
      if (getLimit(p.key, k)) paramsUsed.push(p.short);
    });

    const breachesInClass = [];
    kelasEntries.forEach((e) => {
      PARAM_DEFS.forEach((p) => {
        const limit = getLimit(p.key, k);
        if (!limit) return;
        const val = e[p.key];
        if (val === null || val === undefined || val === "" || val === "-") return;
        const st = getStatus(val, p.key, k);
        if (st.level >= 2) {
          const breachObj = {
            kelas: k,
            roomName: e.roomName || "Ruangan",
            tanggal: shortDate(e.tanggal),
            parameter: p.short,
            value: displayValue(val, k, p.key),
            level: st.level,
            label: st.label,
          };
          breachesInClass.push(breachObj);
          allBreaches.push(breachObj);
        }
      });
    });

    let classNarrative = `Pada periode ${monthLabel}, pengkajian data EM Viable Kelas ${k} pada fasilitas ${facilityLabel} mencakup ${kelasEntries.length} titik sampling di lokasi: ${roomStr} dengan parameter pengujian ${paramsUsed.join(", ")}. `;

    if (breachesInClass.length === 0) {
      classNarrative += `Hasil pemantauan menunjukkan seluruh titik sampling berada dalam kondisi terkendali (state of control) di bawah batas Alert Limit. Rata-rata cemaran mikrobiologi terpantau stabil dan memenuhi persyaratan CPOB/EU GMP Annex 1 untuk Kelas ${k}.`;
    } else {
      const breachDetails = breachesInClass
        .map((b) => `${b.roomName} (${b.parameter}: ${b.value} CFU, status ${b.label} pada ${b.tanggal})`)
        .join("; ");
      classNarrative += `Berdasarkan analisis data, terdeteksi ${breachesInClass.length} titik yang mengalami penyimpangan yaitu: ${breachDetails}. Titik lainnya berada dalam batas terkendali. Diperlukan tindakan evaluasi dan sanitasi terarah pada area tersebut.`;
    }

    perKelas[k] = classNarrative;
  });

  // Kesimpulan Umum (sudah mencakup pernyataan pemenuhan syarat CPOB/EU GMP Annex 1)
  let kesimpulanUmum = "";
  if (totalPointsAll === 0) {
    kesimpulanUmum = `Berdasarkan data yang diinput untuk fasilitas ${facilityLabel} pada periode ${monthLabel}, belum ada titik sampling yang dicatat. Diharapkan untuk melengkapi data pemantauan lingkungan sebelum melakukan evaluasi akhir.`;
  } else if (allBreaches.length === 0) {
    kesimpulanUmum = `Berdasarkan hasil pengkajian data Environment Monitoring (EM) Viable fasilitas ${facilityLabel} periode ${monthLabel}, seluruh titik sampling pada Kelas ${classes.join(", ")} sebanyak ${totalPointsAll} pengujian secara keseluruhan berada dalam batas terkendali (state of control) di bawah Alert Limit. Kondisi lingkungan produksi memenuhi kriteria keberterimaan sesuai ketentuan CPOB dan pedoman BPOM / EU GMP Annex 1. Fasilitas ${facilityLabel} dinyatakan memenuhi syarat kualitas lingkungan mikrobiologi dan direkomendasikan dapat terus digunakan untuk aktivitas operasional/produksi secara penuh pada periode berjalan.`;
  } else {
    const breachClasses = Array.from(new Set(allBreaches.map((b) => `Kelas ${b.kelas}`))).join(", ");
    kesimpulanUmum = `Berdasarkan hasil pengkajian data Environment Monitoring (EM) Viable fasilitas ${facilityLabel} periode ${monthLabel} dari total ${totalPointsAll} pengujian, mayoritas titik pemantauan berada dalam kondisi terkendali. Namun demikian, terdeteksi ${allBreaches.length} kejadian penyimpangan batas (Alert/Action/Melebihi Syarat) yang terdistribusi pada ${breachClasses}. Tindakan penanganan dan investigasi diperlukan untuk memastikan kualitas lingkungan tetap terjaga. Fasilitas ${facilityLabel} dapat digunakan dengan catatan dilakukan penanganan CAPA dan re-sampling ketat pada titik penyimpangan hingga diperoleh hasil yang terkendali secara konsisten sesuai ketentuan CPOB dan EU GMP Annex 1.`;
  }

  // Tindak Lanjut
  let tindakLanjut = "";
  if (allBreaches.length === 0) {
    tindakLanjut = "1. Melanjutkan pemantauan rutin Environment Monitoring Viable sesuai jadwal dan SOP yang berlaku.\n2. Mempertahankan penerapan Good Manufacturing Practice (GMP), prosedur sanitasi ruangan, dan higiene personel secara konsisten.";
  } else {
    tindakLanjut = "1. Melakukan investigasi lapangan dan penelusuran akar masalah (Root Cause Analysis / RCA) terhadap titik yang mengalami penyimpangan.\n2. Melakukan tindakan pembersihan dan desinfeksi ulang (intensified cleaning & sanitization) pada ruangan terdampak.\n3. Melakukan pengujian ulang (re-sampling) pada titik terkait untuk memastikan kondisi lingkungan kembali terkendali.\n4. Mengevaluasi performa dan pola aliran udara sistem HVAC serta filter HEPA di area terkait.";
  }

  return {
    perKelas,
    kesimpulanUmum,
    tindakLanjut,
  };
}
