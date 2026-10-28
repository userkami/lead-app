import { waNumber } from './phone.mjs';

const columns = 'id,name,whatsapp_number,whatsapp_group_link,destination_type,active';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validGroupLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === 'chat.whatsapp.com'
      && !url.username && !url.password && !url.hash
      && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch { return false; }
}

export function executiveFields(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 200)
    throw new Error('Enter a destination name (up to 200 characters).');
  const destinationType = input.destination_type || 'individual';
  if (!['individual', 'group'].includes(destinationType)) throw new Error('Choose an individual or WhatsApp group.');
  if (typeof input.active !== 'boolean') throw new Error('Choose whether the executive is active.');
  if (destinationType === 'group') {
    const link = typeof input.whatsapp_group_link === 'string' ? input.whatsapp_group_link.trim() : '';
    if (link.length > 500 || !validGroupLink(link))
      throw new Error('Enter a valid WhatsApp group invite link starting with https://chat.whatsapp.com/.');
    return { name: input.name.trim(), whatsapp_number: null, whatsapp_group_link: link, destination_type: 'group', active: input.active };
  }
  if (typeof input.whatsapp_number !== 'string' || input.whatsapp_number.length > 80
      || !/^[+\d\s().-]+$/.test(input.whatsapp_number))
    throw new Error('Enter a valid WhatsApp number without letters or extensions.');
  const number = waNumber(input.whatsapp_number);
  if (!/^[1-9]\d{7,14}$/.test(number))
    throw new Error('Enter a WhatsApp number with its country code, such as 923001234567.');
  return { name: input.name.trim(), whatsapp_number: number, whatsapp_group_link: null, destination_type: 'individual', active: input.active };
}

function checkId(id) {
  if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Invalid executive ID. Refresh and try again.');
}
function checked(result) {
  if (result.error?.code === '23503')
    throw new Error('This executive has assigned leads. Reassign or unassign those leads first, or deactivate the executive instead.');
  if (result.error) throw new Error(result.error.message);
  if (!result.data?.length) throw new Error('Executive unavailable or permission denied. Refresh and try again.');
  return result.data[0];
}

// Uses the signed-in client's RLS policies: only admins may mutate executives.
export async function saveExecutive(client, input, id = null) {
  const values = executiveFields(input);
  if (id !== null) checkId(id);
  const query = id === null
    ? client.from('sales_executives').insert(values)
    : client.from('sales_executives').update(values).eq('id', id);
  return checked(await query.select(columns));
}

export async function setExecutiveActive(client, id, active) {
  checkId(id);
  if (typeof active !== 'boolean') throw new Error('Invalid active status.');
  return checked(await client.from('sales_executives').update({ active }).eq('id', id).select(columns));
}

export async function deleteExecutive(client, id) {
  checkId(id);
  return checked(await client.from('sales_executives').delete().eq('id', id).select('id'));
}
