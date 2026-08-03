import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const [users, roles, requests, subscriptions, config] = await Promise.all([
  db.collection("users").get(),
  db.collection("roles").get(),
  db.collection("subscription_requests").get(),
  db.collection("subscriptions").get(),
  db.doc("system/config").get(),
]);

const profiles = users.docs.map((document) => document.data());
const owners = profiles.filter((profile) => profile.is_owner === true);
const employees = profiles.filter((profile) => profile.is_owner !== true);
const administrativeEmployees = employees.filter(
  (profile) => Array.isArray(profile.permissions) && profile.permissions.length > 0,
);
const protectedRoles = roles.docs.filter((role) => role.data().protected === true);

console.log(JSON.stringify({
  ownerCount: owners.length,
  employeeCount: employees.length,
  administrativeEmployeeCount: administrativeEmployees.length,
  newEmployeeDefaultsAreRestricted: employees.every(
    (profile) =>
      Array.isArray(profile.roles) &&
      Array.isArray(profile.permissions) &&
      (profile.roles.length > 0 || profile.permissions.length === 0),
  ),
  protectedOwnerRoleCount: protectedRoles.length,
  customRoleCount: roles.docs.filter((role) => role.data().protected !== true).length,
  primaryOwnerMatchesProfile: owners.length === 1 && config.data()?.owner_uid === owners[0]?.uid,
  requestCount: requests.size,
  subscriptionCount: subscriptions.size,
}, null, 2));
