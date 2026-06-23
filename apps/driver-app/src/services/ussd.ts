export interface UssdCode {
  bank: string;
  code: string;
  description: string;
}

export const USSD_CODES: UssdCode[] = [
  { bank: 'GTBank', code: '*737*', description: 'Dial *737# for transfer and payments' },
  { bank: 'Zenith Bank', code: '*966*', description: 'Dial *966# for Zenith instant banking' },
  { bank: 'Access Bank', code: '*901*', description: 'Dial *901# for Access transaction menu' },
  { bank: 'UBA', code: '*919*', description: 'Dial *919# for UBA magic banking' },
  { bank: 'First Bank', code: '*894*', description: 'Dial *894# for First Bank quick code' },
  { bank: 'Sterling Bank', code: '*822*', description: 'Dial *822# for Sterling services' },
];

export function getUssdInstructions(bankName: string, amountNgn: number, reference: string): string {
  const matching = USSD_CODES.find((u) => u.bank.toLowerCase().includes(bankName.toLowerCase()));
  const baseCode = matching ? matching.code : '*737*';
  return `To pay out-of-band via USSD:
1. Dial ${baseCode} on your registered phone.
2. Select Transfer / Payment option.
3. Transfer NGN ${amountNgn} to HiconnectGo Abuja Account.
4. Reference code: ${reference}.
5. Once complete, our system will reconcile via webhook, or you can contact support.`;
}
