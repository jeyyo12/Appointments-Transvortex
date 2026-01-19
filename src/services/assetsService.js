export async function loadLogoAsDataURL(url) {
  console.log('[Assets] Loading logo from:', url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        console.log('[Assets] Logo loaded successfully');
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[Assets] Failed to load logo:', err);
    throw err;
  }
}

export async function loadTemplateAsDataURL(url) {
  console.log('[Assets] Loading invoice template from:', url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        console.log('[Assets] Template loaded successfully');
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[Assets] Failed to load template:', err);
    throw err;
  }
}
