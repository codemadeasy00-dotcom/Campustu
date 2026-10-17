\set ON_ERROR_STOP off
INSERT INTO categories(slug,name) VALUES('drawing','Drawing');
CREATE FUNCTION pg_temp.mk(e text, st text DEFAULT 'active', verified boolean DEFAULT true) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO users(email,full_name,display_name,status,email_verified_at)
  VALUES (e,'N '||e,e,st, CASE WHEN verified THEN now() END) RETURNING id $$;
CREATE FUNCTION pg_temp.itm(sel uuid, price numeric DEFAULT 100) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO items(seller_id,category_id,title,condition,price)
  VALUES (sel,(SELECT id FROM categories LIMIT 1),'Thing','good',price) RETURNING id $$;
-- full legit deal: reserve, accept, both tap met
CREATE FUNCTION pg_temp.deal(sel uuid, buy uuid, price numeric DEFAULT 100) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid; r uuid;
BEGIN
  i := pg_temp.itm(sel, price);
  INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES (i,buy,now()+interval '1 day') RETURNING id INTO r;
  UPDATE reservations SET status='accepted', agreed_price=price WHERE id=r;
  INSERT INTO handover_confirmations(reservation_id,confirmer_id) VALUES (r,sel);
  INSERT INTO handover_confirmations(reservation_id,confirmer_id) VALUES (r,buy);
  RETURN r;
END $$;
DO $$
DECLARE a uuid; b uuid; c uuid; d uuid; f uuid; fz uuid; unv uuid; i1 uuid; i2 uuid; i3 uuid; r uuid; r2 uuid;
        st text; s text; n int; g1 uuid; g2 uuid; g3 uuid; x uuid;
        rs uuid[]; k int; e1 int; d1 int;
BEGIN
  a:=pg_temp.mk('a'); b:=pg_temp.mk('b'); c:=pg_temp.mk('c'); d:=pg_temp.mk('d'); f:=pg_temp.mk('f');
  fz:=pg_temp.mk('frozen','frozen'); unv:=pg_temp.mk('unverified','active',false);

  -- ===== regression: old behaviour still holds =====
  i1:=pg_temp.itm(a,300); i2:=pg_temp.itm(a,500);
  INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i1,b,now()+interval '48h');
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i1,c,now()+interval '48h'); RAISE NOTICE 'R1 double reserve ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'R1 double reserve refused: %', SQLERRM; END;
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i2,a,now()+interval '48h'); RAISE NOTICE 'R2 self-reserve ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'R2 self-reserve refused'; END;
  UPDATE reservations SET status='cancelled' WHERE item_id=i1;
  SELECT status INTO st FROM items WHERE id=i1; RAISE NOTICE 'R3 item after cancel = %', st;

  -- ===== FIX: account checks =====
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i2,fz,now()+interval '1h'); RAISE NOTICE 'F1 frozen buyer ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'F1 frozen buyer refused: %', SQLERRM; END;
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i2,unv,now()+interval '1h'); RAISE NOTICE 'F2 unverified buyer ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'F2 unverified buyer refused: %', SQLERRM; END;
  i3:=pg_temp.itm(fz,50);
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i3,b,now()+interval '1h'); RAISE NOTICE 'F3 frozen SELLER item ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'F3 frozen seller item refused: %', SQLERRM; END;

  -- ===== happy path =====
  r:=pg_temp.deal(a,b,280);
  SELECT status INTO st FROM reservations WHERE id=r; RAISE NOTICE 'H1 reservation after 2 met taps = %', st;
  SELECT status INTO st FROM items WHERE id=(SELECT item_id FROM reservations WHERE id=r); RAISE NOTICE 'H1 item = %', st;
  SELECT trust_score INTO n FROM user_trust WHERE user_id=b; RAISE NOTICE 'H1 buyer trust_score = %', n;

  -- ===== FIX: dispute path =====
  i1:=pg_temp.itm(c,200);
  INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i1,d,now()+interval '1 day') RETURNING id INTO r;
  UPDATE reservations SET status='accepted', agreed_price=200 WHERE id=r;
  INSERT INTO handover_confirmations(reservation_id,confirmer_id,outcome,note) VALUES(r,d,'problem','item was damaged');
  SELECT status INTO st FROM reservations WHERE id=r; RAISE NOTICE 'D1 after one "problem" tap: reservation = %', st;
  SELECT status INTO st FROM items WHERE id=i1; RAISE NOTICE 'D1 item stays locked = %', st;
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i1,f,now()+interval '1h'); RAISE NOTICE 'D2 third party reserve ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D2 third party reserve refused'; END;
  INSERT INTO handover_confirmations(reservation_id,confirmer_id,outcome) VALUES(r,c,'met');
  SELECT status INTO st FROM reservations WHERE id=r; RAISE NOTICE 'D3 seller taps met afterwards: reservation = % (must stay disputed)', st;
  SELECT trust_score INTO n FROM user_trust WHERE user_id=c; RAISE NOTICE 'D3 seller trust unaffected = %', n;
  UPDATE reservations SET status='cancelled' WHERE id=r;   -- admin resolves
  SELECT status INTO st FROM items WHERE id=i1; RAISE NOTICE 'D4 after admin cancels dispute, item = %', st;

  -- ===== pair farming still blunted =====
  FOR k IN 1..3 LOOP PERFORM pg_temp.deal(c,d,1); END LOOP;
  SELECT trust_score||' / trusted='||is_trusted INTO s FROM user_trust WHERE user_id=d;
  RAISE NOTICE 'P1 D after 3 deals with same partner: %', s;

  -- ===== ring farming: known limit, now visible to admins =====
  PERFORM pg_temp.deal(f,c,1);
  SELECT trust_score||' / trusted='||is_trusted INTO s FROM user_trust WHERE user_id=c;
  RAISE NOTICE 'P2 C after deals with D and F (no real meetups needed): %  <- still possible', s;
  SELECT count(*) INTO n FROM admin_handover_pairs WHERE completed_deals>=3 OR max_price<=1;
  RAISE NOTICE 'P3 admin_handover_pairs rows flaggable (3+ deals or price<=1): %', n;
  UPDATE app_settings SET value=3 WHERE key='trusted_min_partners';
  SELECT is_trusted INTO s FROM user_trust WHERE user_id=c; RAISE NOTICE 'P4 setting trusted_min_partners=3 -> C trusted = %', s;
  UPDATE app_settings SET value=2 WHERE key='trusted_min_partners';
  UPDATE app_settings SET value=20 WHERE key='trust_min_price';
  SELECT trust_score||' / trusted='||is_trusted INTO s FROM user_trust WHERE user_id=c;
  RAISE NOTICE 'P5 setting trust_min_price=20 -> C now: %', s;
  UPDATE app_settings SET value=0 WHERE key='trust_min_price';

  -- ===== FIX: griefing =====
  x:=pg_temp.mk('victim');
  g1:=pg_temp.mk('x1'); g2:=pg_temp.mk('x2'); g3:=pg_temp.mk('x3');
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(g1,x,'other');
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(g2,x,'other');
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(g3,x,'other');
  SELECT status INTO st FROM users WHERE id=x; RAISE NOTICE 'G1 victim after 3 FRESH-account reports = % (reports still in admin queue: %)', st, (SELECT count(*) FROM reports WHERE target_user_id=x AND status='open');
  -- 3 credible reporters (each with a completed handover)
  rs:=ARRAY[]::uuid[];
  FOR k IN 1..5 LOOP g1:=pg_temp.mk('cr'||k); PERFORM pg_temp.deal(pg_temp.mk('cp'||k), g1, 50); rs:=rs||g1; END LOOP;
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(rs[1],x,'other');
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(rs[2],x,'other');
  SELECT status INTO st FROM users WHERE id=x; RAISE NOTICE 'G2 after 2 credible reports = %', st;
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(rs[3],x,'other');
  SELECT status||' ('||frozen_reason||')' INTO s FROM users WHERE id=x; RAISE NOTICE 'G3 after 3 credible reports = %', s;

  -- ===== FIX: 30-day window =====
  g1:=pg_temp.mk('y');
  INSERT INTO reports(reporter_id,target_user_id,reason,created_at) VALUES(rs[1],g1,'other',now()-interval '120 days');
  INSERT INTO reports(reporter_id,target_user_id,reason,created_at) VALUES(rs[2],g1,'other',now()-interval '100 days');
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(rs[3],g1,'other');
  SELECT status INTO st FROM users WHERE id=g1; RAISE NOTICE 'W1 reports spread over 120 days = % (must be active)', st;
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(rs[4],g1,'other');
  SELECT status INTO st FROM users WHERE id=g1; RAISE NOTICE 'W2 two recent + two old = % (must be active)', st;
  INSERT INTO reports(reporter_id,target_user_id,reason) VALUES(rs[5],g1,'other');
  SELECT status INTO st FROM users WHERE id=g1; RAISE NOTICE 'W3 three recent credible = %', st;

  -- ===== FIX: owner's own report does not count =====
  g2:=pg_temp.mk('own'); PERFORM pg_temp.deal(pg_temp.mk('ownp'), g2, 50);
  i1:=pg_temp.itm(g2,10);
  INSERT INTO reports(reporter_id,target_item_id,reason) VALUES(g2,i1,'other');
  INSERT INTO reports(reporter_id,target_item_id,reason) VALUES(rs[1],i1,'other');
  INSERT INTO reports(reporter_id,target_item_id,reason) VALUES(rs[2],i1,'other');
  SELECT status INTO st FROM users WHERE id=g2; RAISE NOTICE 'S1 2 others + own report on own item = % (must be active)', st;

  -- ===== FIX: expiry housekeeping =====
  g3:=pg_temp.mk('s1'); 
  i1:=pg_temp.itm(a,10); INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i1,g3,now()-interval '5 days');
  i2:=pg_temp.itm(a,10); INSERT INTO reservations(item_id,buyer_id,expires_at,status,agreed_price,meet_at) VALUES(i2,g3,now()+interval '1 day','requested',NULL,NULL) RETURNING id INTO r;
  UPDATE reservations SET status='accepted', agreed_price=10, meet_at=now()-interval '5 days' WHERE id=r;       -- nobody tapped
  i3:=pg_temp.itm(a,10); INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES(i3,g3,now()+interval '1 day') RETURNING id INTO r2;
  UPDATE reservations SET status='accepted', agreed_price=10, meet_at=now()-interval '5 days' WHERE id=r2;
  INSERT INTO handover_confirmations(reservation_id,confirmer_id) VALUES(r2,g3);                                 -- one tap only
  SELECT expired, disputed INTO e1, d1 FROM expire_stale_reservations();
  RAISE NOTICE 'E1 expire_stale_reservations: expired=% disputed=% (expect 2 and 1)', e1, d1;
  SELECT string_agg(status,',' ORDER BY status) INTO s FROM items WHERE id IN (i1,i2,i3);
  RAISE NOTICE 'E2 item statuses after cleanup (expect available,available,reserved) = %', s;
END $$;
