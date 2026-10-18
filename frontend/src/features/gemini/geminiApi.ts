import axios from 'axios';

export type GeminiResult = { image: Blob; message: string };

type GeminiResponse = {
  mimeType: string;
  imageBase64: string;
  message?: string;
};

/** N5 talks ONLY to its dedicated Spring endpoint. API keys never reach the browser. */
export async function editWithGemini(image: Blob, prompt: string): Promise<GeminiResult> {
  const token = localStorage.getItem('lumina-access-token');
  if (!token) throw new Error('Bạn cần đăng nhập thật (N1 Auth) trước khi dùng Gemini.');
  const file = new File([image], 'gemini-input.png', { type: image.type || 'image/png' });
  const form = new FormData();
  form.append('image', file);
  form.append('prompt', prompt);
  const url = import.meta.env.VITE_N5_GEMINI_URL || '/api/gemini/edit';
  try {
    const response = await axios.post<GeminiResponse>(url, form, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 180000,
    });
    const { imageBase64, mimeType, message } = response.data;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || !imageBase64) {
      throw new Error('Phản hồi Gemini thiếu ảnh hợp lệ.');
    }
    const binary = atob(imageBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { image: new Blob([bytes], { type: mimeType }), message: message || 'Gemini đã tạo ảnh chỉnh sửa.' };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
      const apiMessage = error.response?.data?.message;
      if (typeof apiMessage === 'string') throw new Error(apiMessage);
      if (error.code === 'ECONNABORTED') throw new Error('Gemini xử lý quá lâu. Hãy thử lại.');
      throw new Error('Không kết nối được Gemini qua Backend. Kiểm tra API key, cổng và tài khoản.');
    }
    throw error;
  }
}
