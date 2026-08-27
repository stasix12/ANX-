export type Provenance = 'REAL' | 'DERIVED' | 'AI_ESTIMATE';

export type SignalStatus = 'emerging' | 'growing' | 'hot' | 'saturated' | 'quiet';

export type Niche = {
  key: string;
  name_he: string;
  name_en: string;
  keywords_he: string[];
  keywords_en: string[];
  sort: number;
};

export type Advertiser = {
  id: string;
  platform: string;
  external_id: string;
  name: string;
  page_url: string | null;
  country: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type Ad = {
  id: string;
  platform: string;
  external_id: string;
  advertiser_id: string;
  niche_key: string | null;
  country: string | null;
  language: string | null;
  ad_type: string | null;
  title: string | null;
  body: string | null;
  body_hash: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_active: boolean;
  landing_url: string | null;
  snapshot_url: string | null;
  source_kind: 'api' | 'user_imported' | 'licensed';
  first_seen_at: string;
  last_seen_at: string;
};

export type AdScore = {
  ad_id: string;
  date: string;
  hot_score: number;
  confidence: number;
  components: Record<string, number>;
  provenance: Provenance;
};

export type NicheMetrics = {
  niche_key: string;
  country: string;
  date: string;
  active_ads: number | null;
  new_ads_7d: number | null;
  active_advertisers: number | null;
  new_advertisers_7d: number | null;
  demand_trend: number | null;
  ad_activity: number | null;
  competition: number | null;
  growth: number | null;
  opportunity: number | null;
  signal_status: SignalStatus | null;
  components: Record<string, number>;
  confidence: number | null;
  provenance: Provenance;
};

export type Offer = {
  id: string;
  normalized_text: string;
  kind: string;
  first_seen_at: string;
};

export type AiAnalysis = {
  ad_id: string;
  model: string;
  analyzed_at: string;
  hook: string | null;
  offer_text: string | null;
  cta: string | null;
  creative_notes: string | null;
  target_audience: string | null;
  pain_point: string | null;
  why_it_works: string | null;
  adaptation: string | null;
  performance_probability: number | null;
  confidence: number | null;
  provenance: Provenance;
};

export type Alert = {
  id: string;
  name: string;
  rule: AlertRule;
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
};

export type AlertRule =
  | { type: 'niche_opportunity'; niche_key?: string; country: string; min_opportunity: number }
  | { type: 'hot_ad'; niche_key?: string; country?: string; min_score: number }
  | { type: 'offer_adoption'; min_advertisers: number; window_days: number };

export type ConnectorState = {
  source: string;
  cursor: string | null;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  stats: Record<string, unknown>;
};
