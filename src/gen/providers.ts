/**
 * Camada de provedores de imagem (PRD §10 e risco "dependência de um provedor").
 * Cada provedor só precisa devolver uma imagem; grade exata e paleta são feitas depois, em código.
 */
export interface GenerateRequest {
  prompt: string;
  seed: number;
  width: number;
  height: number;
  signal?: AbortSignal;
}

export interface ImageProvider {
  id: string;
  name: string;
  description: string;
  /** Custo estimado por imagem, em US$ (0 = gratuito). */
  costPerImage: number;
  /** Retângulo (frações 0..1) com marca d'água a mascarar antes do processamento. */
  watermark?: { x: number; y: number; w: number; h: number };
  needsConfig?: 'urlTemplate' | 'apiKey';
  /** Modelos disponíveis no provedor (o primeiro é o padrão). */
  models?: { id: string; label: string }[];
  generate(req: GenerateRequest, config?: ProviderConfig): Promise<Blob>;
}

export interface ProviderConfig {
  urlTemplate?: string;
  apiKey?: string;
  model?: string;
}

async function fetchImage(url: string, signal?: AbortSignal, retries = 2, headers?: Record<string, string>): Promise<Blob> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal, headers });
    if (res.status === 401) throw new Error('Chave recusada (401). Confira se é uma chave secreta sk_ válida.');
    if (res.status === 402) throw new Error('Saldo da chave esgotado (402). Veja sua cota em enter.pollinations.ai.');
    if (res.ok) {
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('O provedor não devolveu uma imagem.');
      return blob;
    }
    // limite de requisições: espera o tempo pedido e tenta de novo
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Math.min(30, Number(res.headers.get('Retry-After')) || 5 * (attempt + 1));
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error(`Provedor respondeu ${res.status}${res.status === 429 ? ' (limite de uso, tente em instantes)' : ''}.`);
  }
}

export const pollinations: ImageProvider = {
  id: 'pollinations',
  name: 'Pollinations (chave gratuita)',
  description:
    'Precisa de uma chave secreta sk_ criada em enter.pollinations.ai/keys. A chave fica guardada só neste navegador e vai no cabeçalho da requisição.',
  costPerImage: 0,
  needsConfig: 'apiKey',
  models: [
    { id: 'black-forest-labs/flux.1-schnell', label: 'FLUX.1 schnell (rápido)' },
    { id: 'tongyi-mai/z-image-turbo', label: 'Z-Image Turbo (padrão do serviço)' },
    { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 klein 4B' },
  ],
  generate({ prompt, seed, width, height, signal }, config) {
    const key = config?.apiKey?.trim();
    if (!key) throw new Error('Informe sua chave sk_ do Pollinations.');
    if (key.startsWith('pk_')) throw new Error('Chaves pk_ não autenticam. Use uma chave secreta sk_.');
    const model = config?.model || this.models![0].id;
    const url =
      `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}` +
      `?model=${encodeURIComponent(model)}&width=${width}&height=${height}&seed=${seed}`;
    return fetchImage(url, signal, 2, { Authorization: `Bearer ${key}` });
  },
};

export const customUrl: ImageProvider = {
  id: 'custom',
  name: 'URL personalizada',
  description: 'Qualquer serviço que devolva uma imagem via GET. Use {prompt}, {seed}, {width} e {height} no modelo de URL.',
  costPerImage: 0,
  needsConfig: 'urlTemplate',
  generate({ prompt, seed, width, height, signal }, config) {
    const t = config?.urlTemplate?.trim();
    if (!t || !/^https?:\/\//.test(t)) throw new Error('Informe um modelo de URL começando com http(s)://');
    const url = t
      .replaceAll('{prompt}', encodeURIComponent(prompt))
      .replaceAll('{seed}', String(seed))
      .replaceAll('{width}', String(width))
      .replaceAll('{height}', String(height));
    return fetchImage(url, signal);
  },
};

/** Provedor offline: desenha uma forma simples a partir do texto. Serve para testar sem rede. */
export const offlineDemo: ImageProvider = {
  id: 'offline',
  name: 'Demonstração offline',
  description: 'Não usa IA nem rede: desenha uma forma colorida derivada do texto e da semente, para testar o fluxo.',
  costPerImage: 0,
  async generate({ prompt, seed, width, height }) {
    const c = new OffscreenCanvas(width, height);
    const g = c.getContext('2d')!;
    let h = seed;
    for (const ch of prompt) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 2 ** 32);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, width, height);
    const hue = Math.floor(rnd() * 360);
    const body = g.createRadialGradient(width * 0.45, height * 0.4, 10, width / 2, height / 2, width * 0.4);
    body.addColorStop(0, `hsl(${hue} 80% 65%)`);
    body.addColorStop(1, `hsl(${hue} 70% 30%)`);
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(width / 2, height * 0.58, width * (0.22 + rnd() * 0.12), height * (0.25 + rnd() * 0.1), 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `hsl(${(hue + 180) % 360} 70% 55%)`;
    g.beginPath();
    g.ellipse(width / 2, height * 0.3, width * 0.16, height * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1b1b';
    g.fillRect(width * 0.43, height * 0.27, width * 0.03, height * 0.05);
    g.fillRect(width * 0.54, height * 0.27, width * 0.03, height * 0.05);
    await new Promise((r) => setTimeout(r, 300));
    return c.convertToBlob({ type: 'image/png' });
  },
};

export const PROVIDERS: ImageProvider[] = [pollinations, offlineDemo, customUrl];

export function findProvider(id: string): ImageProvider {
  return PROVIDERS.find((p) => p.id === id) ?? pollinations;
}
