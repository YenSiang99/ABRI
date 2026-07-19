import { useSyncExternalStore } from "react";

import { readJSON, writeJSON } from "./persist";
import { setBusinessOwner } from "./businesses";

const ACCOUNTS_KEY = "abri:accounts:v1";

let accountCache = null;
const accountListeners = new Set();

function loadAccounts() {
  if (accountCache) return accountCache;
  accountCache = readJSON(ACCOUNTS_KEY, []);
  return accountCache;
}

function persistAccounts() {
  writeJSON(ACCOUNTS_KEY, accountCache);
  accountListeners.forEach((cb) => cb());
}

function subscribeAccounts(cb) {
  accountListeners.add(cb);
  return () => accountListeners.delete(cb);
}

function getAccountsSnapshot() {
  return loadAccounts();
}

function useAccounts() {
  return useSyncExternalStore(subscribeAccounts, getAccountsSnapshot);
}

function findAccountByEmail(email) {
  const e = email.trim().toLowerCase();
  return loadAccounts().find((a) => a.email.toLowerCase() === e) ?? null;
}

function getAccount(id) {
  if (!id) return null;
  return loadAccounts().find((a) => a.id === id) ?? null;
}

function createAccount({ email, phone, name, role, password, businessId, emailVerified = false, phoneVerified = false }) {
  const all = loadAccounts();
  const account = {
    id: `acc_${Math.random().toString(36).slice(2, 10)}`,
    email: email.trim(),
    phone,
    name,
    role,
    password,
    businessId,
    emailVerified,
    phoneVerified,
    createdAt: new Date().toISOString(),
  };
  accountCache = [...all, account];
  persistAccounts();
  return account;
}

function verifyPassword(email, password) {
  const account = findAccountByEmail(email);
  if (!account || account.password !== password) return null;
  return account;
}

function deleteAccount(id) {
  const all = loadAccounts();
  accountCache = all.filter((a) => a.id !== id);
  persistAccounts();
}

function seedDemoAccountsIfNeeded() {
  loadAccounts();
  if (accountCache.length > 0) return;

  const t2 = createAccount({
    email: "owner@meridianaccounting.my",
    phone: "012-345 6789",
    name: "Wei Ling Tan",
    role: "Director",
    password: "demo1234",
    businessId: "meridian-accounting",
    emailVerified: true,
    phoneVerified: true,
  });
  setBusinessOwner("meridian-accounting", t2.id);

  const t1 = createAccount({
    email: "owner@clearpathcorpsec.my",
    phone: "011-222 3344",
    name: "Amir Hassan",
    role: "Owner",
    password: "demo1234",
    businessId: "clearpath-corp-sec",
    emailVerified: true,
    phoneVerified: true,
  });
  setBusinessOwner("clearpath-corp-sec", t1.id);
}

seedDemoAccountsIfNeeded();

export { useAccounts, findAccountByEmail, getAccount, createAccount, verifyPassword, deleteAccount };
