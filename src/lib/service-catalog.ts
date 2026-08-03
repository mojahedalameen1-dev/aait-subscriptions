export type ServiceBrand = {
  id: string;
  name: string;
  domain: string;
  category: string;
  color: string;
  aliases: string[];
};

const brand = (
  id: string,
  name: string,
  domain: string,
  category: string,
  color: string,
  aliases: string[] = [],
): ServiceBrand => ({ id, name, domain, category, color, aliases });

export const SERVICE_CATALOG: ServiceBrand[] = [
  brand("alibaba-cloud", "Alibaba Cloud", "alibabacloud.com", "استضافة وبنية تحتية", "#FF6A00", ["علي بابا", "سيرفرات علي بابا", "علي بابا كلود"]),
  brand("chatgpt", "ChatGPT", "chatgpt.com", "برمجيات وإنتاجية", "#10A37F", ["شات جي بي تي", "OpenAI", "ChatGPT Team"]),
  brand("cursor", "Cursor", "cursor.com", "برمجيات وإنتاجية", "#111111", ["كيرسر", "Cursor Business"]),
  brand("php", "PHP", "php.net", "استضافة وبنية تحتية", "#777BB4", ["بي اتش بي", "PHP Hosting"]),
  brand("nashirnet", "NashirNet", "nashernet.com", "استضافة وبنية تحتية", "#1C78C0", ["ناشر نت", "سيرفرات ناشر نت", "Nashir Net"]),
  brand("hetzner", "Hetzner", "hetzner.com", "استضافة وبنية تحتية", "#D50C2D", ["هيتزنر", "Hetzner Cloud"]),
  brand("interserver", "InterServer", "interserver.net", "استضافة وبنية تحتية", "#1C5B8F", ["انتر سيرفر", "Inter Server"]),
  brand("ready-server", "Ready Server", "readyserver.sg", "استضافة وبنية تحتية", "#E4282C", ["ريدي", "ReadyServer", "Ready Dedicated"]),
  brand("aws", "Amazon Web Services", "aws.amazon.com", "استضافة وبنية تحتية", "#FF9900", ["AWS", "Amazon Cloud", "أمازون"]),
  brand("azure", "Microsoft Azure", "azure.microsoft.com", "استضافة وبنية تحتية", "#0078D4", ["Azure", "أزور"]),
  brand("google-cloud", "Google Cloud", "cloud.google.com", "استضافة وبنية تحتية", "#4285F4", ["GCP", "جوجل كلاود"]),
  brand("oracle-cloud", "Oracle Cloud", "oracle.com", "استضافة وبنية تحتية", "#F80000", ["OCI", "أوراكل كلاود"]),
  brand("digitalocean", "DigitalOcean", "digitalocean.com", "استضافة وبنية تحتية", "#0080FF", ["ديجيتال أوشن"]),
  brand("cloudflare", "Cloudflare", "cloudflare.com", "استضافة وبنية تحتية", "#F38020", ["كلاود فلير"]),
  brand("vercel", "Vercel", "vercel.com", "استضافة وبنية تحتية", "#000000", ["فيرسل"]),
  brand("firebase", "Firebase", "firebase.google.com", "استضافة وبنية تحتية", "#FFCA28", ["فايربيس"]),
  brand("ovh", "OVHcloud", "ovhcloud.com", "استضافة وبنية تحتية", "#123F6D", ["OVH", "او في اتش"]),
  brand("vultr", "Vultr", "vultr.com", "استضافة وبنية تحتية", "#007BFC", ["فلتر"]),
  brand("linode", "Akamai Cloud / Linode", "linode.com", "استضافة وبنية تحتية", "#00A95C", ["Linode", "لينود"]),
  brand("hostinger", "Hostinger", "hostinger.com", "استضافة وبنية تحتية", "#673DE6", ["هوستنجر"]),
  brand("godaddy", "GoDaddy", "godaddy.com", "استضافة وبنية تحتية", "#1BDBDB", ["جو دادي"]),
  brand("namecheap", "Namecheap", "namecheap.com", "استضافة وبنية تحتية", "#DE3723", ["نيم شيب"]),
  brand("cpanel", "cPanel", "cpanel.net", "استضافة وبنية تحتية", "#FF6C2C", ["سي بانل"]),
  brand("plesk", "Plesk", "plesk.com", "استضافة وبنية تحتية", "#52BBE6", ["بليسك"]),
  brand("github", "GitHub", "github.com", "برمجيات وإنتاجية", "#181717", ["جيت هب", "GitHub Copilot"]),
  brand("gitlab", "GitLab", "gitlab.com", "برمجيات وإنتاجية", "#FC6D26", ["جيت لاب"]),
  brand("microsoft-365", "Microsoft 365", "microsoft.com", "برمجيات وإنتاجية", "#D83B01", ["Office 365", "أوفيس"]),
  brand("google-workspace", "Google Workspace", "workspace.google.com", "برمجيات وإنتاجية", "#4285F4", ["G Suite", "جوجل وورك سبيس"]),
  brand("slack", "Slack", "slack.com", "برمجيات وإنتاجية", "#4A154B", ["سلاك"]),
  brand("zoom", "Zoom", "zoom.us", "برمجيات وإنتاجية", "#2D8CFF", ["زوم"]),
  brand("notion", "Notion", "notion.so", "برمجيات وإنتاجية", "#000000", ["نوشن", "Notion AI"]),
  brand("figma", "Figma", "figma.com", "تصميم وتسويق", "#F24E1E", ["فيجما"]),
  brand("adobe", "Adobe Creative Cloud", "adobe.com", "تصميم وتسويق", "#FF0000", ["Adobe", "أدوبي"]),
  brand("canva", "Canva", "canva.com", "تصميم وتسويق", "#00C4CC", ["كانفا"]),
  brand("atlassian", "Atlassian / Jira", "atlassian.com", "برمجيات وإنتاجية", "#0052CC", ["Jira", "Confluence", "جيرا"]),
  brand("linear", "Linear", "linear.app", "برمجيات وإنتاجية", "#5E6AD2", ["لينير"]),
  brand("clickup", "ClickUp", "clickup.com", "برمجيات وإنتاجية", "#7B68EE", ["كليك أب"]),
  brand("dropbox", "Dropbox", "dropbox.com", "برمجيات وإنتاجية", "#0061FF", ["دروب بوكس"]),
  brand("onepassword", "1Password", "1password.com", "أمن وحماية", "#0094F5", ["ون باسوورد"]),
  brand("bitwarden", "Bitwarden", "bitwarden.com", "أمن وحماية", "#175DDC", ["بت واردن"]),
  brand("claude", "Claude", "claude.ai", "برمجيات وإنتاجية", "#D97757", ["Anthropic", "كلود AI"]),
  brand("gemini", "Google Gemini", "gemini.google.com", "برمجيات وإنتاجية", "#4E82EE", ["Gemini", "جيمناي"]),
  brand("perplexity", "Perplexity", "perplexity.ai", "برمجيات وإنتاجية", "#20808D", ["بيربلكسيتي"]),
  brand("jetbrains", "JetBrains", "jetbrains.com", "برمجيات وإنتاجية", "#000000", ["جيت برينز"]),
  brand("sentry", "Sentry", "sentry.io", "برمجيات وإنتاجية", "#362D59", ["سنتري"]),
  brand("datadog", "Datadog", "datadoghq.com", "برمجيات وإنتاجية", "#632CA6", ["داتا دوج"]),
  brand("mongodb", "MongoDB Atlas", "mongodb.com", "استضافة وبنية تحتية", "#47A248", ["MongoDB", "مونجو"]),
  brand("supabase", "Supabase", "supabase.com", "استضافة وبنية تحتية", "#3ECF8E", ["سوبابيس"]),
  brand("neon", "Neon", "neon.com", "استضافة وبنية تحتية", "#00E599", ["Neon Postgres", "نيون"]),
  brand("twilio", "Twilio", "twilio.com", "برمجيات وإنتاجية", "#F22F46", ["تويليو"]),
  brand("mailchimp", "Mailchimp", "mailchimp.com", "تصميم وتسويق", "#FFE01B", ["ميل تشيمب"]),
  brand("hubspot", "HubSpot", "hubspot.com", "تصميم وتسويق", "#FF7A59", ["هب سبوت"]),
  brand("zendesk", "Zendesk", "zendesk.com", "برمجيات وإنتاجية", "#03363D", ["زنديسك"]),
];

const normalize = (value: string) =>
  value.toLocaleLowerCase().replace(/[\s\-_./\\]+/g, "").trim();

export const serviceLogoUrl = (service: Pick<ServiceBrand, "domain">) =>
  `https://www.google.com/s2/favicons?domain_url=https://${service.domain}&sz=128`;

export function findServiceBrand(name: string) {
  const query = normalize(name);
  if (!query) return undefined;
  return SERVICE_CATALOG.find((service) =>
    [service.name, ...service.aliases].some((candidate) => {
      const normalizedCandidate = normalize(candidate);
      return normalizedCandidate === query || query.includes(normalizedCandidate);
    }),
  );
}

export function searchServiceCatalog(query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return SERVICE_CATALOG;
  return SERVICE_CATALOG.filter((service) =>
    [service.name, service.category, ...service.aliases]
      .map(normalize)
      .some((candidate) => candidate.includes(normalizedQuery)),
  );
}
