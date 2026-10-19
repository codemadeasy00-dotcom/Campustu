\set ON_ERROR_STOP off
INSERT INTO categories(slug,name) VALUES('drawing','Drawing');
INSERT INTO colleges(name,city,status) VALUES ('College A','Pune','approved'),('College B','Nagpur','approved');
CREATE FUNCTION pg_temp.mk(e text, c int) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO users(email,full_name,display_name,email_verified_at,college_id) VALUES (e,e,e,now(),c) RETURNING id $$;
DO $$
DECLARE a1 uuid; a2 uuid; b1 uuid; nc uuid; i uuid; n int; s text;
BEGIN
  a1:=pg_temp.mk('a1',1); a2:=pg_temp.mk('a2',1); b1:=pg_temp.mk('b1',2);
  INSERT INTO users(email,full_name,display_name,email_verified_at) VALUES ('nocollege','x','x',now()) RETURNING id INTO nc;

  INSERT INTO items(seller_id,category_id,title,condition,price) VALUES (a1,1,'Drafter A','good',100) RETURNING id INTO i;
  SELECT college_id INTO n FROM items WHERE id=i; RAISE NOTICE 'C1 item takes seller college = % (expect 1)', n;
  BEGIN INSERT INTO items(seller_id,category_id,title,condition,price,college_id) VALUES (a1,1,'Sneaky','good',1,2) RETURNING id INTO i;
    SELECT college_id INTO n FROM items WHERE id=i; RAISE NOTICE 'C2 supplied college_id is overridden by trigger: % (expect 1)', n; END;
  BEGIN INSERT INTO items(seller_id,category_id,title,condition,price) VALUES (nc,1,'No college','good',1); RAISE NOTICE 'C3 seller without college ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C3 seller without college refused: %', SQLERRM; END;

  SELECT id INTO i FROM items WHERE title='Drafter A';
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES (i,b1,now()+interval '1 day'); RAISE NOTICE 'C4 cross-college reserve ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C4 cross-college reserve refused: %', SQLERRM; END;
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES (i,nc,now()+interval '1 day'); RAISE NOTICE 'C5 no-college buyer ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C5 no-college buyer refused: %', SQLERRM; END;
  BEGIN INSERT INTO reservations(item_id,buyer_id,expires_at) VALUES (i,a2,now()+interval '1 day'); RAISE NOTICE 'C6 same-college reserve allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C6 same-college reserve REFUSED (bad): %', SQLERRM; END;

  BEGIN INSERT INTO conversations(user_a,user_b,item_id) VALUES (LEAST(a1,b1),GREATEST(a1,b1),i); RAISE NOTICE 'C7 cross-college chat ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C7 cross-college chat refused: %', SQLERRM; END;
  BEGIN INSERT INTO conversations(user_a,user_b,item_id) VALUES (LEAST(a1,a2),GREATEST(a1,a2),i); RAISE NOTICE 'C8 same-college chat allowed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C8 same-college chat REFUSED (bad): %', SQLERRM; END;

  -- spot from another college
  INSERT INTO campus_spots(name,lat,lng,college_id) VALUES ('Gate',1,1,2);
  INSERT INTO campus_spots(name,lat,lng,college_id) VALUES ('Gate',2,2,1);   -- same name, other college: allowed
  BEGIN INSERT INTO items(seller_id,category_id,title,condition,price,preferred_spot_id) VALUES (a1,1,'Wrong spot','good',1,1); RAISE NOTICE 'C9 other college spot ALLOWED (bad)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C9 other-college spot refused: %', SQLERRM; END;

  -- lost & found
  INSERT INTO lost_found_posts(author_id,kind,category_id,title,event_date,lat,lng) VALUES (b1,'lost',1,'Lost calc',current_date,1,1) RETURNING id INTO i;
  SELECT college_id INTO n FROM lost_found_posts WHERE id=i; RAISE NOTICE 'C10 lost&found takes author college = % (expect 2)', n;

  -- custom branch rules
  BEGIN UPDATE users SET branch_other='Marine Eng', branch_id=NULL WHERE id=a1; RAISE NOTICE 'C11 custom branch ok'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C11 FAILED: %', SQLERRM; END;
  INSERT INTO branches(code,name) VALUES ('X','X');
  BEGIN UPDATE users SET branch_id=1 WHERE id=a1; RAISE NOTICE 'C12 branch_id + branch_other together ALLOWED (bad)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C12 both branch fields refused'; END;

  -- duplicate college
  BEGIN INSERT INTO colleges(name,city) VALUES ('college a','PUNE'); RAISE NOTICE 'C13 duplicate college ALLOWED (bad)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C13 duplicate college refused'; END;
  BEGIN INSERT INTO colleges(name,city,email_domain) VALUES ('Dom College','Pune','Mixed.Case'); RAISE NOTICE 'C14 upper-case domain ALLOWED (bad)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C14 upper-case domain refused'; END;
END $$;
