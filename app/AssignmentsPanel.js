'use client';
import { useMemo, useState } from 'react';
import { ago } from '../lib/util';
import Icon from './Icon';

const statuses = ['ASSIGNED', 'CONTACTED', 'CLOSED', 'LOST'];
const label = (value) => value ? value[0] + value.slice(1).toLowerCase() : 'Assigned';

export default function AssignmentsPanel({ executives, leads, onOpen }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = executives.find((item) => item.id === selectedId);
  const grouped = useMemo(() => Object.fromEntries(executives.map((item) => [
    item.id, leads.filter((lead) => lead.assigned_to === item.id),
  ])), [executives, leads]);

  if (selected) {
    const assigned = grouped[selected.id] || [];
    return <section className="assignments-page panel-page" aria-labelledby="assignment-destination-title">
      <button className="assignment-back" onClick={() => setSelectedId(null)}><Icon name="arrow" size={17}/>All destinations</button>
      <div className="assignment-destination-head">
        <span className={`destination-avatar ${selected.destination_type === 'group' ? 'is-group' : ''}`}><Icon name={selected.destination_type === 'group' ? 'users' : 'briefcase'}/></span>
        <div><span className="destination-kind">{selected.destination_type === 'group' ? 'WhatsApp group' : 'Individual executive'}</span><h1 id="assignment-destination-title">{selected.name}</h1><p>{assigned.length} assigned {assigned.length === 1 ? 'lead' : 'leads'} · {selected.active ? 'Active' : 'Inactive'}</p></div>
      </div>
      <div className="assignment-status-grid" aria-label="Lead status summary">
        {statuses.map((status) => <div key={status}><span>{label(status)}</span><strong>{assigned.filter((lead) => (lead.lead_status || 'ASSIGNED') === status).length}</strong></div>)}
      </div>
      <div className="assigned-results-head"><h2>Assigned leads</h2><span>{assigned.length}</span></div>
      <div className="assigned-leads-list">
        {assigned.map((lead) => <button key={lead.id} className="assigned-lead-row" onClick={() => onOpen(lead)}>
          <span className="lead-avatar">{(lead.full_name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('')}</span>
          <span className="assigned-lead-copy"><strong>{lead.full_name || 'No name'}</strong><small>{lead.city || 'Location unavailable'} · {lead.property_type_interest || 'Interest not specified'}</small></span>
          <span className="assigned-lead-meta"><small>{ago(lead.created_time)}</small><span className={`status-pill status-${(lead.lead_status || 'ASSIGNED').toLowerCase()}`}>{label(lead.lead_status || 'ASSIGNED')}</span></span>
          <Icon name="chevron" size={16}/>
        </button>)}
        {!assigned.length && <div className="empty-state"><Icon name="briefcase" size={30}/><h3>No assigned leads</h3><p>This destination has not received any leads yet.</p></div>}
      </div>
    </section>;
  }

  return <section className="assignments-page panel-page" aria-labelledby="assignments-title">
    <div className="assignments-intro"><span className="eyebrow">TEAM PIPELINE</span><h1 id="assignments-title">Assignments<span className="accent">.</span></h1><p>Select an individual or WhatsApp group to see every assigned lead and its current status.</p></div>
    <div className="destination-list">
      {executives.map((item) => {
        const assigned = grouped[item.id] || [];
        return <button key={item.id} className="destination-card" onClick={() => setSelectedId(item.id)}>
          <span className={`destination-avatar ${item.destination_type === 'group' ? 'is-group' : ''}`}><Icon name={item.destination_type === 'group' ? 'users' : 'briefcase'}/></span>
          <span className="destination-card-copy"><span className="destination-kind">{item.destination_type === 'group' ? 'WhatsApp group' : 'Individual executive'}{!item.active && ' · Inactive'}</span><strong>{item.name}</strong><small>{assigned.length} assigned {assigned.length === 1 ? 'lead' : 'leads'}</small></span>
          <span className="destination-statuses">{statuses.map((status) => {
            const count = assigned.filter((lead) => (lead.lead_status || 'ASSIGNED') === status).length;
            return count ? <span key={status} className={`status-dot status-${status.toLowerCase()}`} title={`${label(status)}: ${count}`}>{count}</span> : null;
          })}</span>
          <Icon name="chevron" size={17}/>
        </button>;
      })}
      {!executives.length && <div className="empty-state"><Icon name="users" size={30}/><h3>No destinations yet</h3><p>An admin can add individuals and WhatsApp groups from the Destinations tab.</p></div>}
    </div>
  </section>;
}
