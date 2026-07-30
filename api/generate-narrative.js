// Vercel Serverless Function: /api/generate-narrative
// Menerima data ringkasan EM Viable dari website, memanggil Gemini API
// (Google AI Studio) untuk menyusun narasi, dan mengembalikan hasilnya.
//
// PENTING: GEMINI_API_KEY diambil dari Environment Variable di Vercel,
// BUKAN ditulis langsung di file ini. Ini supaya API key tidak ikut ter-upload
// ke GitHub/repo publik (kalau repo-nya publik, siapa pun bisa mencuri
// dan memakai API key tersebut atas biaya Anda).
//
// Cara set di Vercel:
// 1. Buka project di dashboard Vercel -> Settings -> Environment Variables
// 2. Tambahkan: Name = GEMINI_API_KEY, Value = (API key Gemini Anda)
// 3. Pilih semua environment (Production, Preview, Development), lalu Save
// 4. Redeploy project agar env var terbaca

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "GEMINI_API_KEY belum diset di Environment Variables Vercel. Buka Settings > Environment Variables lalu tambahkan GEMINI_API_KEY, kemudian redeploy.",
    });
    return;
  }

  let payload;
  try {
    payload = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch {
    res.status(400).json({ error: "Body request tidak valid" });
    return;
  }

  const { facilityLabel, monthLabel, classes, stats, prevSummary } = payload;

  const prompt = `Anda adalah QA Apoteker berpengalaman di industri farmasi Indonesia yang menyusun bagian pembahasan untuk dokumen resmi "Pengkajian Trend Data Environment Monitoring (EM) Viable" (No. Formulir QA.FM.156), mengacu pada CPOB dan EU GMP Annex 1.
Fasilitas: ${facilityLabel}
Periode: ${monthLabel}
Ringkasan kesimpulan bulan sebelumnya: ${prevSummary || "Tidak ada data bulan sebelumnya."}
Data ringkasan per kelas ruangan (level tertinggi yang tercapai, dan daftar titik yang mencapai Alert/Action/Melebihi Syarat):
${JSON.stringify(stats, null, 2)}

Tulis narasi Bahasa Indonesia formal ala dokumen QA farmasi, mengacu pada data di atas dan mengaitkan dengan kondisi bulan sebelumnya bila relevan. Jangan mengarang angka yang tidak ada di data.

Ketentuan khusus untuk "tindakLanjut": tulis tindakan yang realistis, proporsional terhadap tingkat penyimpangan (Alert vs Action vs Melebihi Syarat), dan mudah dieksekusi oleh tim di lapangan dengan sumber daya rutin yang tersedia (misalnya: pembersihan dan sanitasi ulang titik terdampak, evaluasi teknik sampling/personal hygiene petugas, peningkatan monitoring/reswab pada titik yang sama di periode berikutnya, review jadwal fogging/disinfeksi, pengecekan HVAC/filter/tekanan ruang, retraining singkat petugas gowning). Hindari usulan yang berat, mahal, atau butuh proses panjang (misalnya requalifikasi total, renovasi ruangan, penggantian sistem HVAC) kecuali data benar-benar menunjukkan penyimpangan berulang dan sistemik yang mengharuskannya. Jika kondisi terkendali (memenuhi syarat), cukup nyatakan pemantauan rutin dilanjutkan tanpa tindakan tambahan.

Balas HANYA dengan JSON valid (tanpa markdown, tanpa teks lain) dengan struktur persis:
{
  "perKelas": { "<KODE_KELAS>": "narasi hasil, tren, dan kesimpulan untuk kelas ini (2-4 kalimat)", ... satu entri untuk tiap kelas berikut: ${(classes || []).join(", ")} },
  "kesimpulanUmum": "4-6 kalimat kesimpulan umum seluruh kelas pada periode ini, DIAKHIRI dengan pernyataan tegas apakah fasilitas ini memenuhi syarat CPOB/EU GMP Annex 1 dan status kualifikasi lingkungan periode ini",
  "tindakLanjut": "tindak lanjut praktis dan realistis di lapangan sesuai ketentuan di atas, atau 'Tidak diperlukan tindak lanjut khusus, pemantauan rutin dilanjutkan.' jika semua terkendali"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error (HTTP ${geminiRes.status}): ${errText}`);
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const cleanText = text
      .replace(/^```json\n?/i, "")
      .replace(/^```\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    const parsed = JSON.parse(cleanText);

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
