// Listings that are not businesses, and why. Applied by merge.mjs after the
// sources are combined; every row it removes goes to data/seed/nonbusiness.csv
// with its reason, so nothing disappears without a record.
//
// THE TEST, agreed 27 Sep 2026: could this listing ever claim its page, pass
// SSM verification, and want other businesses to find it? ABRI's model —
// claim, verify, vouch, then Plus/Pro — only works for listings that can.
// A government school, a hospital ward, a condo or a pasar malam never will.
//
// WHEN UNSURE, KEEP. A wrong removal hides a business that could have been a
// member; a wrong keep is one odd card in 147,000. So every rule below has
// COMMERCIAL as its escape hatch: a name with a trading word in it ("Kafe
// Pemuda Masjid", "IIUM Bookshop", "Wisma Kingkoil Sdn Bhd") stays.
//
// ASSOCIATIONS go too, but differently: most are registered with the
// Registrar of Societies, not SSM, so they can't be verified members — yet a
// trade association or chamber speaks for hundreds of businesses. They are
// written out like every other removal and kept as a partner lead list
// (ABRI-associations.xlsx), not discarded.

const COMMERCIAL = /\b(sdn|bhd|berhad|plt|enterprise|trading|tuition|tuisyen|academy|private|international|kpj|pantai|gleneagles|sunway|columbia|prince court|tung shin|assunta|thomson|cafe|caf[eé]|kafe|kafeteria|coffee|restaurant|restoran|kedai|shop|store|bookshop|canteen|kantin|stall|gerai|mart|futsal|badminton|arena|centre|center|car ?wash|pickleball|bsn|maybank|cimb|rhb|bank|clinic|dental|optometry|optical|holdings|group|tadika|kindergarten|taska|hotel|homestay|airbnb|gallery|show ?unit|realty|real estate|properties|agency|agent|developer|development|salon|spa|gym|fitness|muay|golf|laundry|pharmacy|services?|servis|renovation|interior|design|security|7-?eleven|lounge|nasi|cendol|satay|sate|karpet|carpet|supplier|pembekal|petrol|coliv\w*|bar|bistro|kitchen|food|wedding|photo\w*|studio|consult\w*|swim\w* (school|academ\w*|club|class\w*)|medicare|poliklinik|bookstore|auto|motor\w*|accessor\w*|air ?cond|workshop|warung|cuci kereta|coffees|tom yam|temple street|garage|hutong|motor\w*|perabot|furniture|gold|jewel\w*|vape|gamers?|flower|burger|express|communication\w*|7-11|bowling|racing|baking|klinik dr|medik)\b/i;

const RULES = [
  ["government school",
    /^(sk|smk|sjk ?\(?[ct]\)?|sjkc|sjkt|sra|sar|smka|sabk|kafa|s\.\s?r\.\s?k|srjk|smjk|sbp|mrsm|sek\.?\s?keb|sek\.?\s?men|sek\.?\s?ren|smksi)\b|\bsekolah (kebangsaan|menengah kebangsaan|jenis kebangsaan|agama|rendah agama|kebangsaan agama|rendah kebangsaan|menengah agama|menengah sains|sultan|tun|datuk|dato|tunas bakti|sukan|berasrama)\b|\b(maktab rendah sains|kolej tingkatan enam|pusat tingkatan enam)\b/i],
  ["public university",
    /\b(universiti (malaya|kebangsaan malaysia|putra malaysia|teknologi mara|islam antarabangsa|pendidikan sultan)|university of malaya|uitm|upm|ukm|iium|politeknik|kolej komuniti|kolej matrikulasi|institut pendidikan guru|ipg kampus|institut latihan perindustrian|utm|usim|unisza|uthm|utem|unimap|usm|upsi|upnm|uum|universiti pertahanan|kolej vokasional|kolej kemahiran tinggi mara|kktm|ikbn|iktbn|adtec|institut kemahiran|giatmara|jabatan pendidikan|pejabat pendidikan|ppd)\b/i],
  ["public hospital or clinic",
    /\b(klinik kesihatan|klinik desa|klinik 1 ?malaysia|hospital (kuala lumpur|selayang|serdang|putrajaya|sungai buloh|tengku ampuan|tunku|shah alam|kajang|ampang|banting|rehabilitasi|bahagia|canselor|ukm|upm)|htar|pusat perubatan universiti|ppum|ppukm)\b|^(unit|wad|jabatan) /i,
    /public_health_clinic/],
  ["government office",
    /\b(kementerian|pejabat (tanah|daerah|pos|kerajaan|agama|pelajaran|pendidikan|setiausaha)|majlis (perbandaran|bandaraya|daerah)|mbpj|mbsj|dbkl|mpaj|mpkj|balai (polis|bomba)|ibu pejabat polis|police station|fire station|pos malaysia|perpustakaan|public library|mahkamah|lhdn|kwsp|perkeso|jpj|imigresen|immigration department|kedutaan|high commission|consulate|pusat khidmat|parlimen|balai raya|dewan (orang ramai|serbaguna|komuniti|raya|bandaraya)|lembaga|board of (engineers|architects|quantity surveyors)|pejabat mufti|pejabat urusetia)\b/i,
    /office=government|post_office|amenity=library|community_centre|social_facility|weather_station|amenity=parking/],
  ["place of worship",
    /^(masjid|surau|musolla|mosque|church|gereja|temple|kuil|tokong|gurdwara|cathedral)\b|\b(masjid|surau)$/i],
  ["residence",
    // Property listings named for the building people live in, and the
    // shared facilities of one wherever they're filed.
    /\b(residen(ce|ces|cy|si|tial)|condo(minium)?s?|kondo(minium)?|apartments?|pangsapuri|serviced suites?|suites|soho|sofo|sovo|townhouses?|villas?)\b/i,
    null,
    (row) => row.category === "Property" || /\b(swimming pool|pool|jmb|badan pengurusan|management office|club ?house|court)\b/i.test(row.name)],
  ["street market",
    /\b(pasar (malam|tani|pagi|minggu|lambak)|night market|farmers.? market|flea market|bazaar ramadhan)\b/i],
  ["public sports or recreation",
    /\b(padang|gelanggang|stadium|kompleks sukan|taman rekreasi|taman permainan|playground|kolam renang|public swimming pool|jogging|recreational park)\b|^(swimming pool|basketball court|tennis court|volleyball court|football field)\b/i,
    // A source type alone isn't enough ("MoMoSwim" is filed as a swimming
    // pool): only when the name says it's the facility too.
    null,
    null,
    [/soccer_field|swimming_pool|basketball_court|tennis_court|skate_park|baseball_field|volleyball_court|hockey_field/, /\b(pool|court|field|park|padang)\b/i]],
  // An office floor ("Level 11 Menara Milenium") or a landmark. A named
  // Wisma/Menara is often the company's own head office ("Wisma Shuang
  // Hor"), so those stay.
  ["building",
    /^(level|tingkat|floor) \d+|^lot \d+\s*,|\b(twin towers|petronas towers|kl tower|menara kuala lumpur)\b/i],
  ["public housing or quarters",
    /\b(kuarters|perumahan (awam|polis|kerajaan)|rumah pangsa|ppr|program perumahan rakyat|asrama)\b|\bquarters (polis|police|kerajaan|hospital|kementerian|staff)\b|\b(flat (polis|kerajaan|pkns|dbkl))\b|^flat\b/i,
    null,
    // A clinic serving the quarters ("Klinik Utama Kuarters KLIA") is a
    // practice, not the housing.
    (row) => !/^klinik\b/i.test(row.name)],
  ["transport or public infrastructure",
    // The station itself ("Sentul West MRT Station", "Stesen LRT Alam
    // Megah"), not a shop at one ("7-11 USJ7 LRT/BRT Station").
    /^(stesen (lrt|mrt|ktm|bas|keretapi)|plaza tol|toll plaza|hentian bas|terminal bersepadu|bus stop)\b|^[a-z0-9' ]+ (lrt|mrt|ktm|monorail)( station)?$/i],
  ["military, police or prison",
    /\b(maktab tentera|angkatan tentera|pdrm|penjara|prison|lapang sasar|rsat|rejimen|batalion|pangkalan (tentera|udara|laut)|kem (tentera|polis|batu|sungai|segenting|\d+))\b/i],
  ["hawker centre or bazaar",
    /\b(pusat penjaja|medan penjaja|bazaa?r (ramadh?an|ramadhon|jumaat|karat|malam|minggu|taman))\b/i],
  ["address",
    // A street address standing in for a name. One with a name in another
    // script alongside ("Lorong tiong nam 3 阿興飯檔") is a stall, and stays.
    /^(jln|jalan|lorong|lrg|blok|block)\b.*(,|\d)|^(no\.?|lot)\s*\d+[a-z]?\s*,|^\d+[a-z]?,?\s*(jln|jalan|lorong)\b/i,
    null,
    (row) => !/[\p{L}--[\p{sc=Latin}\p{sc=Common}]]/v.test(row.name)],
  ["association",
    /\b(persatuan|pertubuhan|association|yayasan|foundation|dewan perniagaan|chamber of commerce|alumni|kesatuan|rotary|lions club|charity|kebajikan|welfare|society of)\b(?! (studies|and pre|programme|program|year))|^kelab\b|\bmalaysian? [a-z ]+ society\b|\b(institution of|federation of)\b|\bmalaysian institute of (?!art|aviation|culinary|restaurant|technology)|\binstitute of (engineers|accountants|surveyors|architects|planners|chartered|internal auditors|certified)\b/i,
    /shop=charity/],
  ["adult", null, /amenity=brothel/],
];

export function nonBusinessReason(row) {
  const name = row.name || "";
  const type = row.sourceType || "";
  if (COMMERCIAL.test(name)) return null;
  for (const [reason, byName, byType, when, typeAndName] of RULES) {
    const hit = (byName && byName.test(name)) || (byType && byType.test(type)) ||
      (typeAndName && typeAndName[0].test(type) && typeAndName[1].test(name));
    if (hit && (!when || when(row))) return reason;
  }
  return null;
}
