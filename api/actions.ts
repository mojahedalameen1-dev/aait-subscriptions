import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

type Permission =
  | "manage_subscriptions"
  | "review_requests"
  | "reject_requests"
  | "store_credentials"
  | "reveal_credentials"
  | "manage_users_roles"
  | "delete_subscriptions";

type Profile = { permissions?: Permission[]; name?: string };
const ALL_SYSTEM_PERMISSIONS = [
  "view_subscriptions",
  "manage_subscriptions",
  "delete_subscriptions",
  "review_requests",
  "reject_requests",
  "view_financial_reports",
  "manage_users_roles",
  "store_credentials",
  "reveal_credentials",
  "view_audit_log",
];
type VercelRequest = {
  method?: string;
  headers: { authorization?: string; origin?: string };
  body?: { action?: string; payload?: Record<string, unknown> };
};
type VercelResponse = {
  status(code: number): VercelResponse;
  json(value: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
};

function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

function key() {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) throw new Error("CREDENTIALS_KEY is not configured");
  const value = Buffer.from(raw, "base64");
  if (value.length !== 32) throw new Error("CREDENTIALS_KEY must be 32 bytes");
  return value;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decrypt(payload: { ciphertext: string; iv: string; tag: string }) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function allow(profile: Profile, permission: Permission) {
  if (!profile.permissions?.includes(permission))
    throw new Error("ليس لديك صلاحية لهذا الإجراء");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? "";
  const allowedOrigins = [
    "https://aait-subscriptions.vercel.app",
    "https://aait-subscriptions-2026.web.app",
    "https://aait-subscriptions-2026.firebaseapp.com",
  ];
  if (allowedOrigins.includes(origin))
    res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const app = adminApp();
    const authUser = await getAuth(app).verifyIdToken(token);
    const db = getFirestore(app);
    const profileDoc = await db.doc(`users/${authUser.uid}`).get();
    const profile = (profileDoc.data() ?? {}) as Profile;
    const action = String(req.body?.action ?? "");
    const payload = req.body?.payload ?? {};

    if (action === "create_request") {
      const type = payload.type === "renewal" ? "renewal" : "new";
      const serviceName = String(payload.serviceName ?? "").trim();
      const purpose = String(payload.purpose ?? "").trim();
      if (!serviceName || !purpose)
        throw new Error("اسم الخدمة والغاية مطلوبان");
      const beneficiaryName = String(payload.beneficiaryName ?? "").trim();
      if (type === "new" && !beneficiaryName)
        throw new Error("اسم المهندس المستفيد مطلوب");
      const proposedEmail = String(payload.accountEmail ?? "").trim();
      const proposedPassword = String(payload.accountPassword ?? "");
      const proposedCredential = proposedEmail || proposedPassword
        ? encrypt(JSON.stringify({ username: proposedEmail, password: proposedPassword }))
        : null;
      const requestRef = db.collection("subscription_requests").doc();
      const requestData = {
        type,
        service_name: serviceName,
        purpose,
        notes: String(payload.notes ?? ""),
        related_subscription_id:
          type === "renewal" ? String(payload.subscriptionId ?? "") : null,
        suggested_start_date: type === "renewal" ? String(payload.suggestedStartDate ?? "") : "",
        suggested_renewal_date: type === "renewal" ? String(payload.suggestedRenewalDate ?? "") : "",
        requested_by: authUser.uid,
        requester_name: profile.name ?? authUser.email,
        beneficiary_name: beneficiaryName,
        requested_plan: String(payload.requestedPlan ?? "").trim(),
        requested_access: String(payload.requestedAccess ?? "").trim(),
        proposed_account_email: proposedEmail,
        proposed_credential: proposedCredential,
        has_proposed_credentials: Boolean(proposedCredential),
        status: "قيد المراجعة",
        reviewed_by: null,
        reviewed_at: null,
        created_at: FieldValue.serverTimestamp(),
      };
      const reviewers = await db
        .collection("users")
        .where("permissions", "array-contains", "review_requests")
        .get();
      await db.runTransaction(async (tx) => {
        if (type === "renewal") {
          const subscription = await tx.get(
            db.doc(`subscriptions/${requestData.related_subscription_id}`),
          );
          if (
            !subscription.exists ||
            !subscription.data()?.assigned_to?.includes(authUser.uid)
          )
            throw new Error("الاشتراك غير مسند لك");
          const existingRenewal = await tx.get(
            db.collection("subscription_requests").where("related_subscription_id", "==", requestData.related_subscription_id).where("type", "==", "renewal").where("status", "==", "قيد المراجعة").limit(1),
          );
          if (!existingRenewal.empty) throw new Error("يوجد طلب تجديد مفتوح لهذا الاشتراك");
        }
        tx.create(requestRef, requestData);
        reviewers.docs.forEach((reviewer) =>
          tx.create(db.collection("notifications").doc(), {
            user_id: reviewer.id,
            title: type === "renewal" ? "طلب تجديد جديد" : "طلب اشتراك جديد",
            body: `${profile.name ?? authUser.email}: ${serviceName}${beneficiaryName ? ` · للمهندس ${beneficiaryName}` : ""}`,
            read: false,
            priority: "high",
            request_id: requestRef.id,
            created_at: FieldValue.serverTimestamp(),
          }),
        );
      });
      return res.status(200).json({ ok: true, requestId: requestRef.id });
    }

    if (action === "reject_request") {
      allow(profile, "reject_requests");
      const reason = String(payload.reason ?? "").trim();
      if (!reason) throw new Error("سبب الرفض مطلوب");
      const requestRef = db.doc(
        `subscription_requests/${String(payload.requestId)}`,
      );
      await db.runTransaction(async (tx) => {
        const request = await tx.get(requestRef);
        if (!request.exists || request.data()?.status !== "قيد المراجعة")
          throw new Error("الطلب غير متاح للمراجعة");
        tx.update(requestRef, {
          status: "مرفوض",
          rejection_reason: reason,
          reviewed_by: authUser.uid,
          reviewed_at: FieldValue.serverTimestamp(),
        });
        tx.create(db.collection("audit_logs").doc(), {
          action: "رفض طلب",
          entity_id: request.id,
          entity_type: "طلب اشتراك",
          entity_name: String(request.data()?.service_name ?? "طلب"),
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: reason,
          summary: `تم رفض طلب «${String(request.data()?.service_name ?? "اشتراك")}». السبب: ${reason}`,
          created_at: FieldValue.serverTimestamp(),
        });
        tx.create(db.collection("notifications").doc(), {
          user_id: request.data()?.requested_by,
          title: "تم رفض طلب الاشتراك",
          body: reason,
          read: false,
          created_at: FieldValue.serverTimestamp(),
        });
      });
      return res.status(200).json({ ok: true });
    }

    if (action === "approve_request") {
      allow(profile, "review_requests");
      const approvedCost = Number(payload.cost ?? 0);
      if (!Number.isFinite(approvedCost) || approvedCost < 0)
        throw new Error("تكلفة الاشتراك غير صالحة");
      const requestRef = db.doc(
        `subscription_requests/${String(payload.requestId)}`,
      );
      const subscriptionRef = db.collection("subscriptions").doc();
      await db.runTransaction(async (tx) => {
        const request = await tx.get(requestRef);
        if (!request.exists || request.data()?.status !== "قيد المراجعة")
          throw new Error("الطلب غير متاح للمراجعة");
        const data = request.data()!;
        const renewalDate = Timestamp.fromDate(
          new Date(String(payload.renewalDate)),
        );
        if (Number.isNaN(renewalDate.toDate().getTime()))
          throw new Error("تاريخ التجديد غير صالح");
        if (data.type === "renewal") {
          const existingRef = db.doc(
            `subscriptions/${String(data.related_subscription_id)}`,
          );
          const existing = await tx.get(existingRef);
          if (!existing.exists) throw new Error("الاشتراك الأصلي غير موجود");
          const previous = existing.data()!;
          const renewalRef = db.collection("subscriptions").doc();
          tx.create(renewalRef, {
            ...previous,
            renewal_date: renewalDate,
            start_date: payload.renewalStartDate ? Timestamp.fromDate(new Date(String(payload.renewalStartDate))) : FieldValue.serverTimestamp(),
            status: "نشط",
            renewal_of: existingRef.id,
            renewal_count: Number(previous.renewal_count ?? 0) + 1,
            created_by: authUser.uid,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
          tx.update(requestRef, {
            status: "مكتمل",
            reviewed_by: authUser.uid,
            reviewed_at: FieldValue.serverTimestamp(),
            resulting_subscription_id: renewalRef.id,
          });
          tx.create(db.collection("audit_logs").doc(), {
            action: "موافقة على تجديد",
            entity_id: request.id,
            entity_type: "طلب تجديد",
            entity_name: String(data.service_name ?? "اشتراك"),
            actor_uid: authUser.uid,
            actor_name: profile.name ?? authUser.email,
            details: data.service_name,
            summary: `تمت الموافقة على تجديد اشتراك «${String(data.service_name ?? "اشتراك")}» حتى ${renewalDate.toDate().toLocaleDateString("en-CA").replaceAll("-", "/")}.`,
            created_at: FieldValue.serverTimestamp(),
          });
          tx.create(db.collection("notifications").doc(), {
            user_id: data.requested_by,
            title: "تمت الموافقة على التجديد",
            body: data.service_name,
            read: false,
            priority: "high",
            created_at: FieldValue.serverTimestamp(),
          });
          tx.create(db.collection("notifications").doc(), {
            user_id: data.requested_by,
            title: "تم تجديد الاشتراك",
            body: `${data.service_name} · أصبحت فترة الاشتراك الجديدة متاحة في اشتراكاتك`,
            subscription_id: renewalRef.id,
            read: false,
            priority: "high",
            created_at: FieldValue.serverTimestamp(),
          });
          return;
        }
        const subscription = {
          name: data.service_name,
          category: String(payload.category ?? "خدمات أخرى"),
          price: approvedCost,
          currency: "SAR",
          billing_cycle: String(payload.billingCycle ?? "شهري"),
          renewal_date: renewalDate,
          account_email: String(payload.accountEmail ?? ""),
          access_url: String(payload.accessUrl ?? ""),
          assigned_to:
            Array.isArray(payload.assignedTo) && payload.assignedTo.length
              ? payload.assignedTo
              : [data.requested_by],
          team_lead_uid: data.requested_by,
          team_lead_name: data.requester_name ?? "",
          beneficiary_name: String(data.beneficiary_name ?? ""),
          requested_plan: String(data.requested_plan ?? ""),
          status: "نشط",
          has_stored_credentials: false,
          created_by: authUser.uid,
          source_request_id: request.id,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        };
        tx.create(subscriptionRef, subscription);
        if (data.proposed_credential) {
          tx.set(db.doc(`credentials/${subscriptionRef.id}`), {
            ...data.proposed_credential,
            updated_by: authUser.uid,
            updated_at: FieldValue.serverTimestamp(),
          });
          tx.update(subscriptionRef, { has_stored_credentials: true });
        }
        tx.update(requestRef, {
          status: "مكتمل",
          reviewed_by: authUser.uid,
          reviewed_at: FieldValue.serverTimestamp(),
          resulting_subscription_id: subscriptionRef.id,
        });
        tx.create(db.collection("audit_logs").doc(), {
          action: "موافقة على طلب",
          entity_id: request.id,
          entity_type: "طلب اشتراك",
          entity_name: String(data.service_name ?? "اشتراك"),
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: data.service_name,
          summary: `تمت الموافقة على طلب اشتراك «${String(data.service_name ?? "اشتراك")}» بتكلفة ${approvedCost} ر.س.`,
          created_at: FieldValue.serverTimestamp(),
        });
        tx.create(db.collection("notifications").doc(), {
          user_id: data.requested_by,
          title: "تمت الموافقة على طلبك",
          body: payload.accessUrl
            ? `${data.service_name} · رابط الوصول: ${String(payload.accessUrl)}`
            : `${data.service_name} · أصبح متاحًا في اشتراكاتك`,
          access_url: String(payload.accessUrl ?? ""),
          subscription_id: subscriptionRef.id,
          read: false,
          priority: "high",
          created_at: FieldValue.serverTimestamp(),
        });
      });
      return res
        .status(200)
        .json({ ok: true, subscriptionId: subscriptionRef.id });
    }

    if (action === "create_subscription") {
      allow(profile, "manage_subscriptions");
      const name = String(payload.name ?? "").trim();
      const price = Number(payload.price ?? 0);
      const renewal = new Date(String(payload.renewalDate ?? ""));
      if (!name) throw new Error("اسم الخدمة مطلوب");
      if (!Number.isFinite(price) || price < 0)
        throw new Error("تكلفة الاشتراك غير صالحة");
      if (Number.isNaN(renewal.getTime()))
        throw new Error("تاريخ التجديد غير صالح");
      const ref = db.collection("subscriptions").doc();
      const renewalDate = Timestamp.fromDate(renewal);
      await ref.set({
        name,
        category: String(payload.category ?? "خدمات أخرى"),
        price,
        currency: "SAR",
        billing_cycle: String(payload.billingCycle ?? "شهري"),
        renewal_date: renewalDate,
        status: "نشط",
        account_email: String(payload.accountEmail ?? ""),
        access_url: String(payload.accessUrl ?? ""),
        assigned_to: Array.isArray(payload.assignedTo)
          ? payload.assignedTo
          : [],
        has_stored_credentials: false,
        created_by: authUser.uid,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      await db
        .collection("audit_logs")
        .add({
          action: "إضافة اشتراك",
          entity_id: ref.id,
          entity_type: "اشتراك",
          entity_name: name,
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: name,
          summary: `تمت إضافة اشتراك «${name}» بتكلفة ${price} ر.س ودورة فوترة ${String(payload.billingCycle ?? "شهري")}.`,
          created_at: FieldValue.serverTimestamp(),
        });
      return res.status(200).json({ ok: true, subscriptionId: ref.id });
    }

    if (action === "update_subscription") {
      allow(profile, "manage_subscriptions");
      const id = String(payload.subscriptionId ?? "");
      const changes =
        payload.changes && typeof payload.changes === "object"
          ? (payload.changes as Record<string, unknown>)
          : {};
      const allowedChanges: Record<string, unknown> = {};
      const subscriptionRef = db.doc(`subscriptions/${id}`);
      const existingSubscription = await subscriptionRef.get();
      if (!existingSubscription.exists) throw new Error("الاشتراك غير موجود");
      for (const field of [
        "name",
        "category",
        "price",
        "billing_cycle",
        "status",
        "account_email",
        "access_url",
        "assigned_to",
      ] as const)
        if (field in changes) allowedChanges[field] = changes[field];
      if ("renewal_date" in changes)
        allowedChanges.renewal_date = Timestamp.fromDate(
          new Date(String(changes.renewal_date)),
        );
      await subscriptionRef.update({
          ...allowedChanges,
          updated_by: authUser.uid,
          updated_at: FieldValue.serverTimestamp(),
        });
      await db
        .collection("audit_logs")
        .add({
          action: "تعديل اشتراك",
          entity_id: id,
          entity_type: "اشتراك",
          entity_name: String(allowedChanges.name ?? existingSubscription.data()?.name ?? "اشتراك"),
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: String(allowedChanges.name ?? existingSubscription.data()?.name ?? ""),
          summary: `تم تحديث بيانات اشتراك «${String(allowedChanges.name ?? existingSubscription.data()?.name ?? "اشتراك")}».`,
          created_at: FieldValue.serverTimestamp(),
        });
      return res.status(200).json({ ok: true });
    }

    if (action === "delete_subscription") {
      allow(profile, "manage_subscriptions");
      allow(profile, "delete_subscriptions");
      const id = String(payload.subscriptionId ?? "");
      const subscriptionRef = db.doc(`subscriptions/${id}`);
      const subscription = await subscriptionRef.get();
      if (!subscription.exists) throw new Error("الاشتراك غير موجود");
      const subscriptionName = String(subscription.data()?.name ?? "اشتراك");
      await subscriptionRef.delete();
      await db
        .doc(`credentials/${id}`)
        .delete()
        .catch(() => undefined);
      await db
        .collection("audit_logs")
        .add({
          action: "حذف اشتراك",
          entity_id: id,
          entity_type: "اشتراك",
          entity_name: subscriptionName,
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: subscriptionName,
          summary: `تم حذف اشتراك «${subscriptionName}» وبيانات الدخول المرتبطة به نهائيًا.`,
          created_at: FieldValue.serverTimestamp(),
        });
      return res.status(200).json({ ok: true });
    }

    if (action === "store_credential") {
      allow(profile, "store_credentials");
      const subscriptionId = String(payload.subscriptionId ?? "");
      if (!subscriptionId || !payload.secret)
        throw new Error("بيانات الدخول مطلوبة");
      const subscriptionRef = db.doc(`subscriptions/${subscriptionId}`);
      const subscriptionDoc = await subscriptionRef.get();
      if (!subscriptionDoc.exists) throw new Error("الاشتراك غير موجود");
      const encryptedCredential = encrypt(JSON.stringify(payload.secret));
      await db.doc(`credentials/${subscriptionId}`).set({
        ...encryptedCredential,
        updated_by: authUser.uid,
        updated_at: FieldValue.serverTimestamp(),
      });
      await subscriptionRef.update({
        has_stored_credentials: true,
        encrypted_credentials: JSON.stringify(encryptedCredential),
        updated_at: FieldValue.serverTimestamp(),
      });
      await db
        .collection("audit_logs")
        .add({
          action: "تحديث بيانات الدخول",
          entity_id: subscriptionId,
          entity_type: "بيانات دخول",
          entity_name: String(subscriptionDoc.data()?.name ?? "اشتراك"),
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: String(subscriptionDoc.data()?.name ?? ""),
          summary: `تم حفظ أو تحديث بيانات الدخول الخاصة باشتراك «${String(subscriptionDoc.data()?.name ?? "اشتراك")}».`,
          created_at: FieldValue.serverTimestamp(),
        });
      const assignedUsers = Array.isArray(subscriptionDoc.data()?.assigned_to)
        ? (subscriptionDoc.data()?.assigned_to as string[])
        : [];
      await Promise.all(
        assignedUsers.map((userId) =>
          db.collection("notifications").add({
            user_id: userId,
            title: "بيانات دخول الاشتراك متاحة",
            body: `يمكنك إظهار بيانات دخول ${subscriptionDoc.data()?.name ?? "الاشتراك"} مؤقتًا من بطاقته بعد التأكيد.`,
            subscription_id: subscriptionId,
            read: false,
            created_at: FieldValue.serverTimestamp(),
          }),
        ),
      );
      return res.status(200).json({ ok: true });
    }

    if (action === "reveal_credential") {
      if (payload.confirmed !== true) throw new Error("يلزم تأكيد العملية");
      const subscriptionId = String(payload.subscriptionId ?? "");
      const subscriptionDoc = await db
        .doc(`subscriptions/${subscriptionId}`)
        .get();
      const assignedUsers = Array.isArray(subscriptionDoc.data()?.assigned_to)
        ? (subscriptionDoc.data()?.assigned_to as string[])
        : [];
      const canRevealGlobally =
        profile.permissions?.includes("reveal_credentials") === true;
      if (!canRevealGlobally && !assignedUsers.includes(authUser.uid))
        throw new Error("ليس لديك صلاحية لهذا الإجراء");
      const secretDoc = await db.doc(`credentials/${subscriptionId}`).get();
      if (!secretDoc.exists) throw new Error("لا توجد بيانات اعتماد محفوظة");
      const secret = JSON.parse(
        decrypt(
          secretDoc.data() as { ciphertext: string; iv: string; tag: string },
        ),
      );
      await db
        .collection("audit_logs")
        .add({
          action: "عرض بيانات الدخول",
          entity_id: subscriptionId,
          entity_type: "بيانات دخول",
          entity_name: String(subscriptionDoc.data()?.name ?? "اشتراك"),
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: String(subscriptionDoc.data()?.name ?? ""),
          summary: `تم عرض بيانات الدخول الخاصة باشتراك «${String(subscriptionDoc.data()?.name ?? "اشتراك")}».`,
          created_at: FieldValue.serverTimestamp(),
        });
      return res.status(200).json({ ok: true, secret });
    }

    if (action === "save_role") {
      allow(profile, "manage_users_roles");
      const roleName = String(payload.name ?? "");
      const selectedPermissions = Array.isArray(payload.permissions) ? payload.permissions : [];
      const role = await db
        .collection("roles")
        .add({
          name: roleName,
          permissions: selectedPermissions,
          created_by: authUser.uid,
          created_at: FieldValue.serverTimestamp(),
        });
      await db
        .collection("audit_logs")
        .add({
          action: "إنشاء دور",
          entity_id: role.id,
          entity_type: "دور وصلاحيات",
          entity_name: roleName,
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: roleName,
          summary: `تم إنشاء دور «${roleName}» ومنحه ${selectedPermissions.length} صلاحيات.`,
          created_at: FieldValue.serverTimestamp(),
        });
      return res.status(200).json({ ok: true, roleId: role.id });
    }

    if (action === "assign_roles") {
      allow(profile, "manage_users_roles");
      const roleIds = Array.isArray(payload.roleIds)
        ? payload.roleIds.map(String)
        : [];
      const permissions = new Set<string>();
      const roleNames: string[] = [];
      for (const roleId of roleIds) {
        const role = await db.doc(`roles/${roleId}`).get();
        if (!role.exists) throw new Error("أحد الأدوار المحددة غير موجود");
        if (role.data()?.protected === true)
          throw new Error("لا يمكن إسناد دور مالك النظام");
        roleNames.push(String(role.data()?.name ?? roleId));
        role
          .data()
          ?.permissions?.forEach((permission: string) =>
            permissions.add(permission),
          );
      }
      const uid = String(payload.uid ?? "");
      const targetUser = await db.doc(`users/${uid}`).get();
      if (!targetUser.exists) throw new Error("المستخدم غير موجود");
      if (targetUser.data()?.is_owner === true)
        throw new Error("لا يمكن تغيير دور مالك النظام");
      await db
        .doc(`users/${uid}`)
        .update({
          roles: roleIds,
          permissions: [...permissions],
          updated_at: FieldValue.serverTimestamp(),
        });
      await db
        .collection("audit_logs")
        .add({
          action: "إسناد أدوار",
          entity_id: uid,
          entity_type: "مستخدم",
          entity_name: String(targetUser.data()?.name ?? targetUser.data()?.email ?? uid),
          actor_uid: authUser.uid,
          actor_name: profile.name ?? authUser.email,
          details: roleNames.join("، "),
          summary: roleNames.length
            ? `تم إسناد ${roleNames.map((name) => `«${name}»`).join(" و")} إلى ${String(targetUser.data()?.name ?? "المستخدم")}.`
            : `تمت إزالة جميع الأدوار الإدارية من ${String(targetUser.data()?.name ?? "المستخدم")}.`,
          created_at: FieldValue.serverTimestamp(),
        });
      return res.status(200).json({ ok: true });
    }

    if (action === "delete_role") {
      allow(profile, "manage_users_roles");
      const roleId = String(payload.roleId ?? "");
      const roleRef = db.doc(`roles/${roleId}`);
      const roleDoc = await roleRef.get();
      if (!roleDoc.exists) throw new Error("الدور غير موجود");
      if (roleDoc.data()?.protected === true)
        throw new Error("لا يمكن حذف دور مالك النظام");
      const [allUsers, allRoles] = await Promise.all([
        db.collection("users").get(),
        db.collection("roles").get(),
      ]);
      const assignedUsers = allUsers.docs.filter((userDoc) =>
        Array.isArray(userDoc.data().roles) && userDoc.data().roles.includes(roleId),
      );
      const rolesById = new Map(allRoles.docs.map((item) => [item.id, item.data()]));
      const batch = db.batch();
      assignedUsers.forEach((userDoc) => {
        const remainingRoles = ((userDoc.data().roles ?? []) as string[]).filter((id) => id !== roleId);
        const permissions = new Set<string>();
        remainingRoles.forEach((id) =>
          (rolesById.get(id)?.permissions ?? []).forEach((permission: string) => permissions.add(permission)),
        );
        batch.update(userDoc.ref, {
          roles: remainingRoles,
          permissions: [...permissions],
          updated_at: FieldValue.serverTimestamp(),
        });
      });
      batch.delete(roleRef);
      batch.create(db.collection("audit_logs").doc(), {
        action: "حذف دور",
        entity_id: roleId,
        entity_type: "دور وصلاحيات",
        entity_name: String(roleDoc.data()?.name ?? "دور"),
        actor_uid: authUser.uid,
        actor_name: profile.name ?? authUser.email,
        details: String(roleDoc.data()?.name ?? ""),
        summary: `تم حذف دور «${String(roleDoc.data()?.name ?? "دور")}» وإزالته من ${assignedUsers.length} مستخدمين.`,
        created_at: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return res.status(200).json({ ok: true });
    }

    if (action === "grant_system_owner") {
      const config = await db.doc("system/config").get();
      if (config.data()?.owner_uid !== authUser.uid)
        throw new Error("مالك النظام الأساسي فقط يمكنه منح هذه الصلاحية");
      const uid = String(payload.uid ?? "");
      if (!uid || uid === authUser.uid) throw new Error("اختر مستخدمًا آخر");
      const targetRef = db.doc(`users/${uid}`);
      const target = await targetRef.get();
      if (!target.exists) throw new Error("المستخدم غير موجود");
      if (target.data()?.is_owner === true) throw new Error("المستخدم مالك نظام بالفعل");
      const batch = db.batch();
      batch.update(targetRef, {
        is_owner: true,
        roles: ["system-owner"],
        permissions: ALL_SYSTEM_PERMISSIONS,
        promoted_by: authUser.uid,
        updated_at: FieldValue.serverTimestamp(),
      });
      batch.create(db.collection("audit_logs").doc(), {
        action: "منح صلاحية مالك نظام",
        entity_id: uid,
        entity_type: "مستخدم",
        entity_name: String(target.data()?.name ?? target.data()?.email ?? uid),
        actor_uid: authUser.uid,
        actor_name: profile.name ?? authUser.email,
        details: String(target.data()?.name ?? target.data()?.email ?? uid),
        summary: `تمت ترقية ${String(target.data()?.name ?? "المستخدم")} إلى مالك نظام بصلاحيات كاملة.`,
        created_at: FieldValue.serverTimestamp(),
      });
      batch.create(db.collection("notifications").doc(), {
        user_id: uid,
        title: "تم منحك صلاحية مالك النظام",
        body: "أصبحت لديك صلاحيات كاملة ومحميّة داخل النظام.",
        read: false,
        created_at: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "حدث خطأ غير متوقع";
    console.error("[api/actions] failed", {
      action: String(req.body?.action ?? "unknown"),
      actor: req.headers.authorization ? "authenticated" : "anonymous",
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res
      .status(/صلاحية|Unauthorized/.test(message) ? 403 : 400)
      .json({ error: message });
  }
}
