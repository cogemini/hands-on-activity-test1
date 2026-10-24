// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { APP } from '../src/config/app';
import { manilaToUtc } from '../src/services/api';

vi.mock('../src/map/SpatialPreview', () => ({ default: () => <div aria-label="Spatial renderer test stand-in" /> }));
let review = false;
let failSpatial = false;
const categories = ['natural_hazards', 'fire_rescue', 'medical_public_health', 'public_safety', 'road_transportation', 'infrastructure_utilities', 'environmental', 'social_community_welfare', 'other'].map((code) => ({ code, label: code === 'natural_hazards' ? 'Natural Hazards' : code.replaceAll('_', ' ') }));
const nodes = JSON.parse(readFileSync('public/data/barangay_nodes.geojson', 'utf8'));
const barangays = nodes.features.map((f: { properties: { adm4_psgc: string; adm4_en: string }; geometry: { coordinates: number[] } }) => ({ psgc: f.properties.adm4_psgc, name: f.properties.adm4_en, representativePoint: { longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1] } }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  review = false; failSpatial = false;
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/data/')) {
      if (failSpatial) throw new Error('offline');
      return { ok: true, json: async () => JSON.parse(readFileSync(`public${url}`, 'utf8')) };
    }
    const data = url === '/api/health' ? { features: { localDemoReview: review } }
      : url === '/api/reference/barangays' ? barangays : url === '/api/reference/categories' ? categories
      : url === '/api/incidents' ? { reference: 'ILO-ISOLATED-UNIT-FIXTURE', status: 'submitted', createdAt: '2026-01-01T00:00:00.000Z' }
      : { total: 0, barangays: [], categories: [], severities: [], statuses: [] };
    return { ok: true, json: async () => ({ data, error: null }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('iLONGGO MVP shell and form', () => {
  it('uses approved identity, metadata, and accessible landmarks', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<title>iLONGGO · Research Prototype</title>');
    expect(html).toContain(`content="${APP.description} Research Prototype."`);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('iLONGGO');
    expect(screen.getByText(APP.subtitle, { selector: '.brand-subtitle' })).toBeTruthy();
    expect(screen.getByText(APP.designation, { selector: '.prototype-tag' })).toBeTruthy();
    expect(screen.getByRole('main', { name: 'iLONGGO spatial overview' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to spatial overview' }).getAttribute('href')).toBe('#main-content');
  });

  it('exposes only functional navigation and gates Local Demo Review on server capability', async () => {
    review = true;
    render(<App />);
    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(nav.getByRole('link', { name: 'Public Map' })).toBeTruthy();
    expect(nav.queryByRole('button', { name: /Analytics/ })).toBeNull();
    await nav.findByRole('link', { name: /Local Demo Review/ });
    expect(screen.queryByRole('button', { name: /admin/i })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeTruthy();
  });

  it('opens a real report form, validates required fields and submits only allowed barangay-level data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Report an Incident' }));
    const form = await screen.findByRole('form', { name: 'Incident report' });
    await waitFor(() => expect(within(form).getAllByRole('option')).toHaveLength(196));
    expect(within(screen.getByLabelText('Barangay')).getAllByRole('option')).toHaveLength(181);
    expect(within(screen.getByLabelText('Category')).getAllByRole('option')).toHaveLength(10);
    expect(within(screen.getByLabelText('Severity')).getAllByRole('option')).toHaveLength(5);
    expect((form as HTMLFormElement).checkValidity()).toBe(false);
    await user.selectOptions(screen.getByLabelText('Barangay'), barangays[0].psgc);
    await user.selectOptions(screen.getByLabelText('Category'), 'natural_hazards');
    await user.selectOptions(screen.getByLabelText('Severity'), 'moderate');
    fireEvent.change(screen.getByLabelText('Incident date'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Incident time'), { target: { value: '20:30' } });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit incident report' }));
    await screen.findByText('ILO-ISOLATED-UNIT-FIXTURE');
    expect(screen.getByText(/review and explicit publication/i)).toBeTruthy();
    const calls = vi.mocked(fetch).mock.calls;
    const call = calls.find(([url]) => url === '/api/incidents');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ barangayPsgc: barangays[0].psgc, categoryCode: 'natural_hazards', severity: 'moderate', occurredAt: '2026-01-01T12:30:00.000Z', description: '' });
    expect(Object.keys(JSON.parse(String(call?.[1]?.body)))).not.toContain('latitude');
  });

  it('opens information by keyboard, preserves full name and disclaimer, and handles Escape cancellation', async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('button', { name: 'About iLONGGO and important disclaimers' }).focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(APP.fullName);
    expect(dialog.textContent).toContain(APP.emergencyNotice);
    expect(dialog.textContent).toContain(APP.locationNotice);
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows actual geography and an honest public empty state', async () => {
    render(<App />);
    await screen.findByText('Spatial layers loaded successfully');
    expect(screen.getByText('180', { selector: '.geography-number' })).toBeTruthy();
    await screen.findByText('No verified and published incidents are available yet.');
    expect(screen.getByTestId('published-total').textContent).toBe('0');
    expect(screen.getByLabelText('Location interpretation').textContent).toBe(APP.locationNotice);
    expect(screen.queryByText(/response rate|average response time/i)).toBeNull();
  });

  it('preserves keyboard layer toggles, barangay selection and filter reset', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Spatial layers loaded successfully');
    const points = screen.getByRole('checkbox', { name: 'Representative points' }) as HTMLInputElement;
    expect(points.checked).toBe(false); points.focus(); await user.keyboard(' '); expect(points.checked).toBe(true);
    const select = screen.getByRole('combobox', { name: 'Explore a barangay' });
    expect(within(select).getAllByRole('option')).toHaveLength(181);
    await user.selectOptions(select, barangays[0].psgc);
    expect(screen.getByText('Barangay preview only. This does not select an incident site.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect((select as HTMLSelectElement).value).toBe('');
    await user.selectOptions(screen.getByLabelText('Severity filter'), 'high');
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect((screen.getByLabelText('Severity filter') as HTMLSelectElement).value).toBe('');
  });

  it('shows retryable spatial errors and validates Manila time independently of browser timezone', async () => {
    failSpatial = true;
    render(<App />);
    await screen.findByText('Layers could not be loaded');
    failSpatial = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry spatial layers' }));
    await screen.findByText('Spatial layers loaded successfully');
    expect(manilaToUtc('2026-01-01', '00:30')).toBe('2025-12-31T16:30:00.000Z');
  });
});
