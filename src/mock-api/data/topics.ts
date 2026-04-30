import type { Topic } from '../../types/radar';

export const TOPICS_BY_PROFILE: Record<string, Topic[]> = {
  provenance_fairscape: [
    { id: 'T11431', name: 'Research Data Provenance and Evidence', count: 11, on: true },
    { id: 'T10123', name: 'FAIR Data Principles', count: 9, on: true },
    { id: 'T12567', name: 'Metadata and Data Integration', count: 8, on: true },
    { id: 'T13089', name: 'Scientific Workflow Systems', count: 7, on: true },
    { id: 'T14201', name: 'Semantic Web and Linked Data', count: 6, on: false },
    { id: 'T15832', name: 'Reproducibility in Computational Science', count: 4, on: false },
  ],
  cryo_em_particle_picking: [
    { id: 'T21004', name: 'Cryo-Electron Tomography', count: 10, on: true },
    { id: 'T21120', name: 'Particle Picking and Template Matching', count: 8, on: true },
    { id: 'T21205', name: 'Sub-Tomogram Averaging', count: 6, on: true },
    { id: 'T22012', name: 'Deep Learning for Microscopy', count: 5, on: false },
    { id: 'T22441', name: 'In-Situ Structural Biology', count: 4, on: false },
  ],
  single_cell_atlas: [
    { id: 'T30011', name: 'Single-Cell RNA Sequencing', count: 14, on: true },
    { id: 'T30180', name: 'Integration and Batch Correction', count: 9, on: true },
    { id: 'T30220', name: 'Lineage Tracing and CRISPR Barcodes', count: 6, on: true },
    { id: 'T31105', name: 'Variational Inference', count: 5, on: false },
  ],
  protein_language_models: [
    { id: 'T40002', name: 'Protein Language Models', count: 13, on: true },
    { id: 'T40050', name: 'Protein Sequence Design', count: 11, on: true },
    { id: 'T40220', name: 'Structure Prediction', count: 8, on: true },
    { id: 'T41004', name: 'Flow Matching and Diffusion for Sequences', count: 6, on: true },
    { id: 'T41210', name: 'Remote Homology Detection', count: 4, on: false },
  ],
  knowledge_graphs_bio: [
    { id: 'T50044', name: 'Biomedical Knowledge Graphs', count: 9, on: true },
    { id: 'T50112', name: 'Drug-Target Interaction', count: 7, on: true },
    { id: 'T50330', name: 'Graph Embedding Methods', count: 5, on: false },
    { id: 'T51010', name: 'Pharmacovigilance', count: 4, on: false },
  ],
};
