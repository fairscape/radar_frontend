import type { VaultDoc } from '../../types/radar';

export const VAULT_DOCS: VaultDoc[] = [
  { id: 'v1', title: 'The FAIRSCAPE framework: computational provenance crates for evidence graphs', authors: ['Al-Amin, S.', 'Levinson, M.', '+3'], venue: 'Sci. Data · 2024', tags: ['provenance_fairscape'], pages: 18, chunks: 42, added: '2024-06-12' },
  { id: 'v2', title: 'RO-Crate: a lightweight approach to research object packaging', authors: ['Soiland-Reyes, S.', 'Sefton, P.', '+5'], venue: 'Data Sci. · 2022', tags: ['provenance_fairscape'], pages: 24, chunks: 58, added: '2024-07-01' },
  { id: 'v3', title: 'PROV-O ten years on: provenance on the open web', authors: ['Lebo, T.', 'Sahoo, S.'], venue: 'Semantic Web · 2023', tags: ['provenance_fairscape'], pages: 22, chunks: 48, added: '2024-07-04' },
  { id: 'v4', title: 'Reusable biomedical evidence graphs with typed attestations', authors: ['Levinson, M.', 'Sansone, S.-A.'], venue: 'J. Biomed. Semantics · 2025', tags: ['provenance_fairscape'], pages: 16, chunks: 33, added: '2024-09-18' },
  { id: 'v5', title: 'SPECTER2: adapting scientific document embeddings with task-specific adapters', authors: ['Singh, A.', 'Cohan, A.', '+3'], venue: 'ACL · 2024', tags: ['protein_language_models', 'provenance_fairscape'], pages: 14, chunks: 27, added: '2024-10-02' },
  { id: 'v6', title: 'Template matching for cryo-ET: a re-evaluation under modern detector physics', authors: ['Pereira, J.', 'Scheres, S.'], venue: 'J. Struct. Biol. · 2024', tags: ['cryo_em_particle_picking'], pages: 19, chunks: 40, added: '2024-11-11' },
  { id: 'v7', title: 'TomoPicker-2: self-supervised particle picking in noisy tomograms', authors: ['Chang, Y.-W.', 'Briegel, A.', '+2'], venue: 'Nat. Methods · 2025', tags: ['cryo_em_particle_picking'], pages: 17, chunks: 36, added: '2025-01-20' },
  { id: 'v8', title: 'ESM-3: token-level protein language modelling at scale', authors: ['Hayes, T.', 'Rao, R.', '+7'], venue: 'Science · 2024', tags: ['protein_language_models'], pages: 21, chunks: 44, added: '2024-05-09' },
  { id: 'v9', title: 'ProteinMPNN: robust deep learning based protein sequence design', authors: ['Dauparas, J.', 'Anishchenko, I.', '+5'], venue: 'Science · 2022', tags: ['protein_language_models'], pages: 12, chunks: 25, added: '2024-05-09' },
  { id: 'v10', title: 'scVI: probabilistic inference for single-cell transcriptomics', authors: ['Lopez, R.', 'Regier, J.', '+2'], venue: 'Nat. Methods · 2018', tags: ['single_cell_atlas'], pages: 13, chunks: 28, added: '2024-08-03' },
  { id: 'v11', title: 'Integration benchmarks in scRNA-seq: what we measure and what we miss', authors: ['Huang, Y.', 'Brenner, S.E.'], venue: 'Genome Res. · 2025', tags: ['single_cell_atlas'], pages: 22, chunks: 47, added: '2025-02-14' },
  { id: 'v12', title: 'Lineage tracing with CRISPR barcodes: a primer', authors: ['Weinreb, C.', 'Klein, A.'], venue: 'Nat. Rev. Genet. · 2023', tags: ['single_cell_atlas'], pages: 26, chunks: 58, added: '2025-03-01' },
];

export const VAULT_META = {
  rootPath: '~/rag_vault/',
  indexPath: 'chroma/ · 512-dim',
  chunkSize: '500 tok + 50 overlap',
  lastIngest: '2026-04-15 22:14',
};
