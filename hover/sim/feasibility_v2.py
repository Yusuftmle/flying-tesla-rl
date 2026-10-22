"""
feasibility_v2.py  -  Rampadan ters fırlama -> takla toparlama -> yumuşak iniş
 
Bu bir RL ajanı DEĞİL. El yazması basit bir kontrolcü ile görevin FİZİKSEL OLARAK çözülebilir
olduğunu kanıtlar. Yeni ortamın parametreleri (RCS dahil) buradan alınmalı.
 
Koordinat: x sağ, z yukarı, theta = saat yönünün tersi (+), theta=0 -> araç dik ve BURNU +x yönünde.
Fırlatma: rampa yayı 125 derece döner -> çıkışta theta ~ +125 derece (araç ters), omega = v/R2 > 0.
Aktüatörler: 3 ana itici (0..Tmax, gövde 'yukarı' eksenine) + 2 RCS jeti (burun/kuyruk, +-FR).
"""
import numpy as np, math

g = 9.81
m = 1800.0
I = 3750.0
A = 1.8                       # ana itici kolu
Tmax = 0.6 * m * g            # itici basina (~10,594.8 N)
ARM = 2.3                     # RCS kolu (burun/kuyruk)
FR = 5000.0                   # RCS max kuvvet (+/-)
TAU_M = 0.08
TAU_R = 0.03
ZG = 0.7
H = 30.0                      # rampa cikis yuksekligi
R2 = 1.19 * H                 # ust yay yaricapi
DT = 1.0 / 120.0
 
def wrap(a):
    return (a + math.pi) % (2.0 * math.pi) - math.pi
 
def run(seed, xt=-12.0, verbose=False):
    rng = np.random.default_rng(seed)
    th0 = math.radians(125.0 + rng.uniform(-15.0, 15.0))
    v = rng.uniform(5.0, 12.0)
    s = dict(
        x=0.0,
        z=H + ZG,
        vx=v * math.cos(th0),
        vz=v * math.sin(th0),
        th=th0,
        om=v / R2 + rng.uniform(-0.15, 0.15),
        T=np.zeros(3),
        R=np.zeros(2)
    )
    phase = 1
    t = 0.0
    while t < 30.0:
        th = wrap(s['th'])
        # ---- kontrolcu
        if phase == 1 and abs(th) < 0.35 and abs(s['om']) < 0.8:
            phase = 2
        Tcmd = np.zeros(3)
        Rcmd = np.zeros(2)
        if phase == 1:
            tau = I * (-6.0 * th - 4.9 * s['om'])
            Rcmd = np.array([tau / (2.0 * ARM), -tau / (2.0 * ARM)])
        else:
            ax = np.clip(0.35 * (xt - s['x']) - 0.9 * s['vx'], -3.0, 3.0)
            thd = np.clip(-math.atan2(ax, g), -0.35, 0.35)
            h = max(s['z'] - ZG, 0.0)
            vdes = -(0.5 + 0.8 * math.sqrt(2.0 * 2.5 * h))
            F = m * (g + 6.0 * (vdes - s['vz'])) / max(math.cos(th), 0.5)
            F = float(np.clip(F, 0.0, 3.0 * Tmax))
            tau = I * (-14.0 * (th - thd) - 7.0 * s['om'])
            tm = np.clip(tau, -A * Tmax * 1.5, A * Tmax * 1.5)
            Tcmd = np.array([F / 3.0 + tm / (2.0 * A), F / 3.0, F / 3.0 - tm / (2.0 * A)])
            Rcmd = np.clip(np.array([tau - tm, -(tau - tm)]) / (2.0 * ARM), -FR, FR)
        Tcmd = np.clip(Tcmd, 0.0, Tmax)
        Rcmd = np.clip(Rcmd, -FR, FR)
        # ---- fizik
        s['T'] += (Tcmd - s['T']) * (1.0 - math.exp(-DT / TAU_M))
        s['R'] += (Rcmd - s['R']) * (1.0 - math.exp(-DT / TAU_R))
        Fup = s['T'].sum() + s['R'].sum()
        sn, cs = math.sin(s['th']), math.cos(s['th'])
        ax_ = (-Fup * sn - 60.0 * s['vx']) / m
        az_ = (Fup * cs - 60.0 * s['vz']) / m - g
        tq = s['T'][0] * A - s['T'][2] * A + s['R'][0] * ARM - s['R'][1] * ARM
        al = (tq - 900.0 * s['om']) / I
        s['vx'] += ax_ * DT
        s['vz'] += az_ * DT
        s['x'] += s['vx'] * DT
        s['z'] += s['vz'] * DT
        s['om'] += al * DT
        s['th'] += s['om'] * DT
        t += DT
        if s['z'] <= ZG:
            soft = (abs(s['vz']) <= 1.5) and (abs(s['vx']) <= 2.0) and (abs(wrap(s['th'])) <= math.radians(8.0))
            return soft, dict(t=t, x=s['x'], vz=s['vz'], vx=s['vx'], th=math.degrees(wrap(s['th'])), v0=v, th0=math.degrees(th0))
    return False, dict(t=t, timeout=True)
 
if __name__ == '__main__':
    res = [run(i) for i in range(200)]
    ok = sum(r[0] for r in res)
    print("=" * 60)
    print("   FEASIBILITY V2: FIZIKSEL COZULEBILIRLIK KANITI")
    print("=" * 60)
    print(f"Basarili Yumusak Inis: {ok} / 200 (%{ok/2.0:.1f})")
    bad = [r[1] for r in res if not r[0]]
    print(f"Basarisiz Inis Sayisi: {len(bad)}")
    for f in bad[:5]:
        print("   Hata Detay:", {k: (round(float(v), 2) if not isinstance(v, bool) else v) for k, v in f.items()})
    ts = [r[1]['t'] for r in res if r[0]]
    print(f"Ortalama Ucus Suresi (Basarili): {np.mean(ts):.2f} s")
    th0 = [r[1]['th0'] for r in res]
    print(f"Firlatma theta0 Araligi: {min(th0):.1f} deg .. {max(th0):.1f} deg")
    print("=" * 60)
