import { ImageResponse } from 'next/og';

export const alt = 'Nivomi AI — AI voice automation for sales teams';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        color: '#ffffff',
        background: 'linear-gradient(145deg, #120611 0%, #2a0a22 55%, #5a0a3d 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg viewBox="150 40 1660 1262" width="64" height="49">
          <path
            fill="#FF75BF"
            d="M157 1299 1410 42v1043h183V383h212v916h-607V556L671 1085h398v214z"
          />
          <path fill="#FF75BF" d="M1593 42h212v213h-212z" />
        </svg>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>NIVOMI AI</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -3 }}>
          AI voice automation for sales teams.
        </div>
        <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.75)' }}>
          Calls · Qualification · Appointments · Human handoff · CRM sync
        </div>
      </div>
    </div>,
    size,
  );
}
