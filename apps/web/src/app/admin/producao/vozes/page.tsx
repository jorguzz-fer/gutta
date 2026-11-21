import type { Metadata } from 'next';
import { AdminHeader } from '@/components/admin/ui';
import { MediaSettingsForm } from '@/components/production/media-settings-form';
import { getMediaSettings } from '@/features/production/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Vozes e cota de mídia' };

// Voz de narração por disciplina e cota diária de créditos de mídia (docs/producao, Fase 3).
// O piloto mostrou que a voz padrão do gerador de vídeo tinha sotaque estrangeiro: aqui cada
// disciplina fica com uma voz nativa fixa da ElevenLabs.
export default async function VoicesPage() {
  const user = await requireRole(['admin'], '/admin/producao/vozes');
  const { settings } = await getMediaSettings(user.id);
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Vozes e cota de mídia"
        crumbs={[{ href: '/admin/producao', label: 'Produção de aulas' }]}
        lead="A voz narra todos os vídeos da disciplina. A cota limita os créditos de imagem e clipe por dia; quando acaba, a geração para e continua sozinha no dia seguinte."
      />
      <MediaSettingsForm settings={settings} />
    </div>
  );
}
