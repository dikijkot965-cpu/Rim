/**
 * RIM recovery phrase format v1.
 * 23 random bytes (184 bits) + one SHA-256 checksum byte, mapped to 256 words.
 * This is intentionally NOT BIP-39 and is not a wallet seed. It is an account
 * recovery credential understood only by RIM.
 */
export const RECOVERY_WORDS = Object.freeze([...new Set(`amber anchor apple april arch arrow artist ash atlas autumn awake badge bamboo banner basin beach beacon berry birch bird black blade bloom blue board boat body bolt book border bottle brave breeze brick bridge bronze brush bubble bucket cactus cabin cable camera candle canyon canvas captain carbon carpet castle cedar chain chair chalk charm cherry chess chief child choice circle city clay clean cliff clock cloud coast coffee copper coral corner cotton crane creek crown crystal culture current curve dance danger dawn deer delta desert design diamond dinner doctor dolphin door dragon dream drift eagle earth east echo edge editor eight elder elm ember engine equal escape evening fabric falcon family farm feather field figure film filter fire fish flame flight flower fog forest fork frame freedom frost fruit galaxy garden gate gentle ghost giant glass globe glory gold grain grape grass gravity green grid ground guard guitar habit harbor harmony harvest hazel heart hill history hollow honey horizon horse hotel house human humble ice icon idea image island ivory jacket jade jazz jewel journey judge jungle kernel key kingdom kite kitten knowledge lake lantern laptop lava leaf legend lemon letter library light lily limit linen lion liquid lizard logic lotus lunar machine magnet maple marble market meadow memory metal meteor midnight mirror mist model moment monkey moon morning mountain mouse movie museum music mystery myth nation native nature navy needle nerve nest network nickel night noble north novel number oak oasis ocean office olive omega onion orbit orchid origin orange orbit order organ origin outer oxygen palace paper parcel parent park parrot path patient pattern pearl pebble pencil pepper person phoenix piano picture pilot pine pioneer planet plant plastic plate plaza poem polar pollen pond portal powder prairie prayer prince prism proof pulse purple puzzle quantum queen quest quiet rabbit radar radio rain rainbow ranch random ranger raven reader realm reason rebel record red reef region relic remote river road robin rocket rose royal ruby ruler saddle sage sailor salt sample sand sapphire scale school science scout screen sea season secret seed shadow shape shelter shield ship shore signal silver simple singer sister sky slate sleep smile smoke snow solar soldier solid song sound south space sparrow speaker spirit spring square stable star steel stone storm story stream summer sun sunset sword symbol table talent temple theory thread thunder ticket timber time toast token tower travel treasure tree triangle tribute trumpet tulip tunnel turtle twilight unity universe update valley velvet venture verb vessel violet vision voice voyage wagon walnut water wave west wheat whisper white willow window winter wisdom wolf wonder wood world writer yellow yesterday young zenith`.split(/\s+/))].slice(0, 256));

if (RECOVERY_WORDS.length !== 256 || new Set(RECOVERY_WORDS).size !== 256) {
  throw new Error('RIM recovery wordlist must contain exactly 256 unique words.');
}
const WORD_INDEX = new Map(RECOVERY_WORDS.map((word, index) => [word, index]));
// A separate 2,048-entry mnemonic dictionary: 64 familiar roots × 32 familiar endings.
// The hyphenated tokens are custom RIM words and are not compatible with BIP-39.
export const RECOVERY_WORDS_12 = Object.freeze(
  RECOVERY_WORDS.slice(0, 64).flatMap(prefix => RECOVERY_WORDS.slice(64, 96).map(suffix => `${prefix}-${suffix}`))
);
const WORD12_INDEX = new Map(RECOVERY_WORDS_12.map((word, index) => [word, index]));

function bytesToBits(bytes) { return [...bytes].map(byte => byte.toString(2).padStart(8, '0')).join(''); }
function bitsToBytes(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8).padEnd(8, '0'), 2);
  return bytes;
}

export async function createRecoveryPhrase(cryptoRef = globalThis.crypto, wordCount = 24) {
  if (!cryptoRef?.getRandomValues || !cryptoRef?.subtle?.digest) {
    throw new Error('Криптографический генератор недоступен. Откройте RIM через защищённое соединение.');
  }
  if (wordCount === 12) {
    const entropy = cryptoRef.getRandomValues(new Uint8Array(16));
    const digest = new Uint8Array(await cryptoRef.subtle.digest('SHA-256', entropy));
    const packed = bytesToBits(entropy) + digest[0].toString(2).padStart(8, '0').slice(0, 4);
    return Array.from({ length: 12 }, (_, index) => RECOVERY_WORDS_12[parseInt(packed.slice(index * 11, index * 11 + 11), 2)]).join(' ');
  }
  if (wordCount !== 24) throw new Error('Поддерживаются только форматы на 12 или 24 слова.');
  const entropy = cryptoRef.getRandomValues(new Uint8Array(23));
  const checksum = new Uint8Array(await cryptoRef.subtle.digest('SHA-256', entropy));
  return [...entropy, checksum[0]].map(byte => RECOVERY_WORDS[byte]).join(' ');
}

export async function validateRecoveryPhrase(value, cryptoRef = globalThis.crypto) {
  const words = String(value ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 24 && words.every(word => WORD_INDEX.has(word))) {
    const bytes = words.map(word => WORD_INDEX.get(word));
    const entropy = new Uint8Array(bytes.slice(0, 23));
    const checksum = new Uint8Array(await cryptoRef.subtle.digest('SHA-256', entropy));
    return checksum[0] === bytes[23];
  }
  if (words.length === 12 && words.every(word => WORD12_INDEX.has(word))) {
    const packed = words.map(word => WORD12_INDEX.get(word).toString(2).padStart(11, '0')).join('');
    const entropy = bitsToBytes(packed.slice(0, 128));
    const expected = new Uint8Array(await cryptoRef.subtle.digest('SHA-256', entropy));
    return packed.slice(128) === expected[0].toString(2).padStart(8, '0').slice(0, 4);
  }
  return false;
}

export function normalizeRecoveryPhrase(value) {
  return String(value ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}
