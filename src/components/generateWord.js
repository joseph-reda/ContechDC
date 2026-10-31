// -------------------------
//    GENERATE WORD FILE
// -------------------------
import { API_URL } from "../config";

export async function downloadWord(ir) {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const getTodayDate = () => {
      const now = new Date();
      return now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    const payload = {
      ...ir,
      requestType: ir.requestType || (ir.isCPR ? "CPR" : "IR"),
      receivedDate: ir.receivedDate || getTodayDate(),
      downloadedBy: user.fullname || "",
    };

    console.log("📤 Word generation payload:", payload);

    const res = await fetch(`${API_URL}/generate-word`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to generate file");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    
    const filename = ir.irNo || `${payload.requestType}-document`;
    a.download = `${filename}.docx`;
    
    document.body.appendChild(a);
    a.click();
    a.remove();
    
    // تنظيف الذاكرة
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    
    console.log(`✅ Word file downloaded: ${filename}.docx`);
    
  } catch (error) {
    console.error("Download Error:", error);
    alert("حدث خطأ أثناء تحميل الملف: " + error.message);
  }
}
