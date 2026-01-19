export async function loadLogoAsDataURL(url) {
  console.log('[assetsService] Loading logo from:', url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        console.log('[assetsService] Logo loaded successfully');
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[assetsService] Failed to load logo:', err);
    return null;
  }
}

export async function loadInvoiceTemplate(url) {
  console.log('[assetsService] Loading invoice template from:', url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load template: ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        console.log('[assetsService] Template loaded successfully');
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[assetsService] Failed to load template:', err);
    return null;
  }
}
