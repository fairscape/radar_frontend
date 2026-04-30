import type { ChatTurn } from '../../types/radar';

export const CHAT_TURNS: ChatTurn[] = [
  {
    who: 'user',
    t: '09:42',
    body: 'How do FAIRSCAPE crates differ from plain RO-Crates for multi-step workflow attestation?',
  },
  {
    who: 'assistant',
    t: '09:42',
    body: [
      'Plain RO-Crates package inputs, outputs, and a workflow definition into a single flat manifest; PROV relations are optional and typically aggregated at the crate level [1][2].',
      'FAIRSCAPE extends this by emitting one crate per workflow step, each typed against a biomedical evidence schema, and links them into a compositional evidence graph via explicit wasDerivedFrom edges [1][3]. The per-step granularity is what enables selective disclosure and cross-study attestation downstream [4].',
    ],
    sources: [
      { n: 1, title: 'The FAIRSCAPE framework: computational provenance crates...', score: 0.91 },
      { n: 2, title: 'RO-Crate: a lightweight approach to research object packaging', score: 0.82 },
      { n: 3, title: 'Reusable biomedical evidence graphs with typed attestations', score: 0.78 },
      { n: 4, title: 'PROV-O ten years on: provenance on the open web', score: 0.64 },
    ],
  },
];
