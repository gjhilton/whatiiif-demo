// Names for things the site links to, as a visitor would put them: a licence by its short name, a file by its
// kind and size.

// RightsStatements.org's statements, by the code in their address.
const STATEMENTS: Record<string, string> = {
  InC: 'In Copyright',
  'InC-OW-EU': 'In Copyright – EU Orphan Work',
  'InC-EDU': 'In Copyright – Educational Use Permitted',
  'InC-NC': 'In Copyright – Non-Commercial Use Permitted',
  'InC-RUU': 'In Copyright – Rights-holder(s) Unlocatable or Unidentifiable',
  'NoC-CR': 'No Copyright – Contractual Restrictions',
  'NoC-NC': 'No Copyright – Non-Commercial Use Only',
  'NoC-OKLR': 'No Copyright – Other Known Legal Restrictions',
  'NoC-US': 'No Copyright – United States',
  CNE: 'Copyright Not Evaluated',
  UND: 'Copyright Undetermined',
  NKC: 'No Known Copyright',
};

/** A rights URI, as the build writes them, by the name its publisher gives it: CC BY 4.0, In Copyright. */
export function rightsName(url: string): string {
  const [, licence, version, jurisdiction] = /^http:\/\/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)\/(?:([a-z-]+)\/)?$/.exec(url) ?? [];
  if (licence) return ['CC', licence.toUpperCase(), version, jurisdiction?.toUpperCase()].filter(Boolean).join(' ');
  const [, tool, toolVersion] = /^http:\/\/creativecommons\.org\/publicdomain\/(zero|mark)\/([\d.]+)\/$/.exec(url) ?? [];
  if (tool) return `${tool === 'zero' ? 'CC0' : 'Public Domain Mark'} ${toolVersion}`;
  const [, statement] = /^http:\/\/rightsstatements\.org\/vocab\/([\w-]+)\/[\d.]+\/$/.exec(url) ?? [];
  return STATEMENTS[statement] ?? url;
}

/** A number of bytes as a computer shows a file's size: 48 KB, 4.1 MB, 123 MB. */
export function fileSize(bytes: number): string {
  const [amount, unit] = bytes >= 1e9 ? [bytes / 1e9, 'GB'] : bytes >= 1e6 ? [bytes / 1e6, 'MB'] : [Math.max(1, bytes / 1e3), 'KB'];
  return `${amount < 10 && unit !== 'KB' ? amount.toFixed(1) : Math.round(amount)} ${unit}`;
}

/** A picture's media type by the name people know its format by. */
export const formatName = (mediaType: string) => ({ 'image/tiff': 'TIFF', 'image/png': 'PNG', 'image/jpeg': 'JPEG' })[mediaType] ?? mediaType;
