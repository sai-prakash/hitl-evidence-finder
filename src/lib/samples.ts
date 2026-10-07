export type EvidencePage = {
  id: string;
  title: string;
  sourceLabel: string;
  pageNumber: number;
  excerpt: string;
  tags: string[];
  src: string;
};

export type Claim = {
  id: string;
  text: string;
  /** Soft hint for demos — not used as a hard filter. */
  expectedPageId?: string;
  tone: 'supported' | 'contested' | 'misleading';
};

/** Synthetic PDF-page corpus (demo). Passages are generated for retrieval demos. */
export const EVIDENCE_PAGES: EvidencePage[] = [
  {
    id: 'page-arctic',
    title: 'Climate Brief · Arctic Sea Ice',
    sourceLabel: 'Demo science brief',
    pageNumber: 1,
    excerpt:
      'Satellite observations since 1979 show a long-term decline in Arctic September sea-ice extent of approximately 13% per decade relative to the 1981–2010 mean. Multi-year ice has thinned substantially, and the ice-free season lengthens as melt onset advances and freeze-up delays.',
    tags: ['arctic', 'sea ice', 'climate', 'satellite', 'extent'],
    src: '/samples/page-arctic-sea-ice.svg',
  },
  {
    id: 'page-renewables',
    title: 'Energy Outlook · Renewables Capacity',
    sourceLabel: 'Demo energy outlook',
    pageNumber: 2,
    excerpt:
      'Global renewable electricity capacity expanded rapidly after 2015, driven by utility-scale solar photovoltaics and onshore wind. By the early 2020s, cumulative renewable capacity roughly doubled versus mid-2010s baselines in widely cited energy-agency tallies.',
    tags: ['renewables', 'solar', 'wind', 'capacity', 'energy'],
    src: '/samples/page-renewables.svg',
  },
  {
    id: 'page-co2',
    title: 'Atmosphere · Carbon Dioxide',
    sourceLabel: 'Demo atmosphere note',
    pageNumber: 3,
    excerpt:
      'Continuous in-situ measurements of atmospheric carbon dioxide show a clear seasonal cycle superimposed on a rising multi-decade trend. Recent annual means at reference observatories have exceeded 420 parts per million (ppm), well above pre-industrial levels near 280 ppm.',
    tags: ['co2', 'carbon dioxide', 'atmosphere', 'ppm', 'mauna loa'],
    src: '/samples/page-co2-ppm.svg',
  },
];

/** AI-style claims the reviewer clicks to retrieve evidence. */
export const CLAIMS: Claim[] = [
  {
    id: 'claim-ice-decline',
    text: 'Arctic September sea-ice extent has declined by roughly 13% per decade since satellite records began in 1979.',
    expectedPageId: 'page-arctic',
    tone: 'supported',
  },
  {
    id: 'claim-renewables-double',
    text: 'Global renewable electricity capacity roughly doubled between the mid-2010s and the early 2020s.',
    expectedPageId: 'page-renewables',
    tone: 'supported',
  },
  {
    id: 'claim-co2-420',
    text: 'Atmospheric CO₂ at reference observatories recently exceeded 420 ppm, far above the pre-industrial ~280 ppm baseline.',
    expectedPageId: 'page-co2',
    tone: 'supported',
  },
  {
    id: 'claim-ice-stable',
    text: 'Arctic sea-ice extent has been essentially stable for the last forty years with no meaningful long-term decline.',
    expectedPageId: 'page-arctic',
    tone: 'misleading',
  },
  {
    id: 'claim-coal-vs-solar',
    text: 'Utility-scale solar and onshore wind drove most of the post-2015 surge in renewable electricity capacity additions.',
    expectedPageId: 'page-renewables',
    tone: 'supported',
  },
];

/** Document text used when indexing PDF pages for text retrieval. */
export function pageDocumentText(page: EvidencePage): string {
  const tags = page.tags.join(', ');
  return `title: ${page.title} | text: ${page.sourceLabel}, page ${page.pageNumber}. ${page.excerpt} Tags: ${tags}.`;
}

export function claimQueryText(claim: string): string {
  return `task: search result | query: ${claim}`;
}
