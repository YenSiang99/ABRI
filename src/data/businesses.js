const businesses = [
  {
    id: "meridian-accounting",
    name: "Meridian Accounting",
    category: "Accounting & Tax",
    tier: "T2",
    vouchCount: 14,
    location: "Petaling Jaya",
    description:
      "Full-service accounting and tax filing for SMEs, with a focus on fast SSM annual return turnaround.",
  },
  {
    id: "sentul-corp-services",
    name: "Sentul Corp Services",
    category: "Corporate Secretarial",
    tier: "T2",
    vouchCount: 21,
    location: "Kuala Lumpur",
    description:
      "Company secretarial services covering incorporation, statutory filings, and compliance advisory.",
  },
  {
    id: "bangsar-legal-partners",
    name: "Bangsar Legal Partners",
    category: "Law",
    tier: "T2",
    vouchCount: 9,
    location: "Bangsar",
    description:
      "Commercial law firm specialising in contracts, corporate structuring, and dispute resolution.",
  },
  {
    id: "clearpath-corp-sec",
    name: "Clearpath Corp Sec",
    category: "Corporate Secretarial",
    tier: "T1",
    vouchCount: 3,
    location: "Subang Jaya",
    description:
      "Boutique company secretarial practice serving early-stage and growth-stage businesses.",
  },
  {
    id: "novatech-consulting",
    name: "NovaTech Consulting",
    category: "IT Consulting",
    tier: "T1",
    vouchCount: 5,
    location: "Shah Alam",
    description:
      "IT infrastructure and systems consulting for SMEs migrating to cloud-based operations.",
  },
  {
    id: "puchong-tax-advisory",
    name: "Puchong Tax Advisory",
    category: "Accounting & Tax",
    tier: "T1",
    vouchCount: 2,
    location: "Puchong",
    description:
      "Tax planning and compliance advisory for owner-managed businesses across the Klang Valley.",
  },
  {
    id: "kl-secretarial-group",
    name: "KL Secretarial Group",
    category: "Corporate Secretarial",
    tier: "T0",
    vouchCount: 0,
    location: "Kuala Lumpur",
    description:
      "Company secretarial firm listed from public SSM registry data. Not yet claimed by an owner.",
  },
  {
    id: "damansara-law-chambers",
    name: "Damansara Law Chambers",
    category: "Law",
    tier: "T0",
    vouchCount: 0,
    location: "Petaling Jaya",
    description:
      "Legal practice listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "subang-it-solutions",
    name: "Subang IT Solutions",
    category: "IT Consulting",
    tier: "T0",
    vouchCount: 0,
    location: "Subang Jaya",
    description:
      "IT services provider listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "shah-alam-corp-advisors",
    name: "Shah Alam Corp Advisors",
    category: "Corporate Secretarial",
    tier: "T0",
    vouchCount: 0,
    location: "Shah Alam",
    description:
      "Corporate secretarial firm listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "cheras-accounting-hub",
    name: "Cheras Accounting Hub",
    category: "Accounting & Tax",
    tier: "T0",
    vouchCount: 0,
    location: "Kuala Lumpur",
    description:
      "Accounting practice listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "gombak-secretarial-services",
    name: "Gombak Secretarial Services",
    category: "Corporate Secretarial",
    tier: "T0",
    vouchCount: 0,
    location: "Kuala Lumpur",
    description:
      "Company secretarial firm listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "usj-corp-sec-partners",
    name: "USJ Corp Sec Partners",
    category: "Corporate Secretarial",
    tier: "T1",
    vouchCount: 1,
    location: "Subang Jaya",
    description:
      "Company secretarial services for SMEs in the USJ and Subang commercial corridor.",
  },
  {
    id: "kelana-jaya-law-associates",
    name: "Kelana Jaya Law Associates",
    category: "Law",
    tier: "T0",
    vouchCount: 0,
    location: "Petaling Jaya",
    description:
      "Legal practice listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "mont-kiara-accounting-co",
    name: "Mont Kiara Accounting Co",
    category: "Accounting & Tax",
    tier: "T0",
    vouchCount: 0,
    location: "Kuala Lumpur",
    description:
      "Accounting practice listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "brickfields-corp-services",
    name: "Brickfields Corp Services",
    category: "Corporate Secretarial",
    tier: "T2",
    vouchCount: 11,
    location: "Kuala Lumpur",
    description:
      "Company secretarial and compliance firm serving professional-services clients across KL.",
  },
  {
    id: "klang-it-partners",
    name: "Klang IT Partners",
    category: "IT Consulting",
    tier: "T0",
    vouchCount: 0,
    location: "Shah Alam",
    description:
      "IT consulting firm listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "ttdi-corp-sec-studio",
    name: "TTDI Corp Sec Studio",
    category: "Corporate Secretarial",
    tier: "T1",
    vouchCount: 4,
    location: "Kuala Lumpur",
    description:
      "Company secretarial studio supporting startups and SMEs through incorporation and compliance.",
  },
  {
    id: "sunway-legal-group",
    name: "Sunway Legal Group",
    category: "Law",
    tier: "T1",
    vouchCount: 2,
    location: "Subang Jaya",
    description:
      "Commercial and corporate law practice serving the Sunway and Subang business corridor.",
  },
  {
    id: "puchong-corp-sec-hub",
    name: "Puchong Corp Sec Hub",
    category: "Corporate Secretarial",
    tier: "T0",
    vouchCount: 0,
    location: "Puchong",
    description:
      "Company secretarial firm listed from public registry data. Not yet claimed by an owner.",
  },
  {
    id: "bangsar-south-accounting",
    name: "Bangsar South Accounting",
    category: "Accounting & Tax",
    tier: "T2",
    vouchCount: 7,
    location: "Kuala Lumpur",
    description:
      "Accounting and tax advisory firm with a client base of professional-services SMEs.",
  },
  {
    id: "petaling-jaya-corp-registry",
    name: "Petaling Jaya Corp Registry",
    category: "Corporate Secretarial",
    tier: "T0",
    vouchCount: 0,
    location: "Petaling Jaya",
    description:
      "Company secretarial firm listed from public registry data. Not yet claimed by an owner.",
  },
];

export { businesses };
