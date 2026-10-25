insert into accounts (id, email) values ('11111111-1111-1111-1111-111111111111', 'mara@example.com')
  on conflict do nothing;
insert into balances (account_id, asset, available, reserved) values
  ('11111111-1111-1111-1111-111111111111', 'BTC', 1.5, 0),
  ('11111111-1111-1111-1111-111111111111', 'EUR', 10000, 0)
  on conflict do nothing;
insert into wallet_balances (asset, amount) values ('BTC', 1.5), ('EUR', 10000)
  on conflict do nothing;
