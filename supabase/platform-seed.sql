-- ============================================================================
-- Compact sample data for the platform tables (run AFTER platform-schema.sql).
--
-- Note: the app ships with a full in-browser demo mode (20 leads, 10 pros,
-- live dispatch waves) that needs no database at all — this seed is only for
-- exercising the Supabase backend itself. Auth users cannot be created from
-- SQL: create them in Authentication → Users, then map them here:
--
--   insert into platform_users (id, role, pro_id, data) values
--     ('<auth-uuid>', 'admin', null, '{"id":"admin-1","name":"סטס","role":"admin"}'),
--     ('<auth-uuid>', 'sales_agent', null, '{"id":"agent-1","name":"דנה לוי","role":"sales_agent"}'),
--     ('<auth-uuid>', 'professional', 'pro-1', '{"id":"pro-user-1","name":"אבי מזרחי","role":"professional"}');
-- ============================================================================

insert into platform_professionals (id, approved, online, city, data) values
('pro-1', true, true, 'beer-sheva', '{"id":"pro-1","createdAt":"2025-06-01T08:00:00Z","name":"אבי מזרחי","phone":"052-1111111","businessName":"אבי מזרחי — ניקוי מקצועי","businessType":"licensed","city":"beer-sheva","areas":["beer-sheva","ofakim","netivot"],"radiusKm":25,"hasCar":true,"services":["sofa","corner_sofa","mattress","carpet","chairs"],"languages":["עברית"],"yearsExperience":7,"workPhotos":[],"documents":[],"approved":true,"online":true,"rating":4.9,"ratingCount":84,"completedJobs":170,"cancelledJobs":2,"totalTaken":174,"avgResponseSec":45,"jobsLast7d":4,"repeatCustomers":14,"complaintsCount":0,"onTimeRate":0.97,"lat":31.2518,"lng":34.7913}'),
('pro-2', true, true, 'beer-sheva', '{"id":"pro-2","createdAt":"2025-07-15T08:00:00Z","name":"מיכאל גרוס","phone":"053-2222222","businessName":"מיכאל גרוס — ניקוי מקצועי","businessType":"exempt","city":"beer-sheva","areas":["beer-sheva","kiryat-gat"],"radiusKm":25,"hasCar":true,"services":["sofa","corner_sofa","mattress","carpet","chairs"],"languages":["עברית","רוסית"],"yearsExperience":3,"workPhotos":[],"documents":[],"approved":true,"online":true,"rating":4.7,"ratingCount":41,"completedJobs":78,"cancelledJobs":3,"totalTaken":82,"avgResponseSec":90,"jobsLast7d":1,"repeatCustomers":6,"complaintsCount":0,"onTimeRate":0.93,"lat":31.2555,"lng":34.7818}'),
('pro-3', false, false, 'jerusalem', '{"id":"pro-3","createdAt":"2025-09-01T08:00:00Z","name":"ליאור חדד","phone":"052-1010101","businessName":"ליאור חדד — ניקוי מקצועי","businessType":"exempt","city":"jerusalem","areas":["jerusalem"],"radiusKm":25,"hasCar":true,"services":["sofa","mattress"],"languages":["עברית"],"yearsExperience":2,"workPhotos":[],"documents":[],"approved":false,"online":false,"rating":0,"ratingCount":0,"completedJobs":0,"cancelledJobs":0,"totalTaken":0,"avgResponseSec":120,"jobsLast7d":0,"repeatCustomers":0,"complaintsCount":0,"onTimeRate":0.9,"lat":31.7683,"lng":35.2137}')
on conflict (id) do nothing;

-- Opening balances through the ledger RPC (creates TOP_UP transactions).
select platform_wallet_apply('pro-1', 'TOP_UP', 500, null, 'טעינת ארנק — פתיחה');
select platform_wallet_apply('pro-2', 'TOP_UP', 300, null, 'טעינת ארנק — פתיחה');

insert into platform_leads (id, phone, status, city, data) values
('lead-1', '050-2223334', 'new', 'beer-sheva', '{"id":"lead-1","createdAt":"2026-09-10T08:00:00Z","updatedAt":"2026-09-10T08:00:00Z","name":"עדי רחמים","phone":"050-2223334","hasWhatsapp":true,"city":"beer-sheva","address":"הפלמ\"ח 18","items":[{"categoryId":"corner_sofa","qty":1},{"categoryId":"carpet","qty":1}],"condition":["כתמים קשים"],"photos":[],"preferred":"today","preferredDate":null,"source":"google","utm":{"source":"google","campaign":"sofa-bsh","medium":"cpc"},"status":"new","quotedPrice":null,"agentId":null,"followupAt":null,"followupNote":"","answered":false,"activities":[],"customerId":null,"jobId":null}'),
('lead-2', '052-3334445', 'new', 'tel-aviv', '{"id":"lead-2","createdAt":"2026-09-10T09:00:00Z","updatedAt":"2026-09-10T09:00:00Z","name":"ליאת מור","phone":"052-3334445","hasWhatsapp":true,"city":"tel-aviv","address":"ארלוזורוב 60","items":[{"categoryId":"sofa","qty":1},{"categoryId":"mattress","qty":1}],"condition":[],"photos":[],"preferred":"tomorrow","preferredDate":null,"source":"facebook","utm":{"source":"facebook","campaign":"sofa-summer"},"status":"new","quotedPrice":null,"agentId":null,"followupAt":null,"followupNote":"","answered":false,"activities":[],"customerId":null,"jobId":null}')
on conflict (id) do nothing;

insert into platform_ad_spend (id, date, source, data) values
('spend-1', current_date, 'google', jsonb_build_object('id','spend-1','date',current_date,'source','google','campaign','sofa-bsh','amount',480)),
('spend-2', current_date, 'facebook', jsonb_build_object('id','spend-2','date',current_date,'source','facebook','campaign','sofa-summer','amount',420))
on conflict (id) do nothing;
