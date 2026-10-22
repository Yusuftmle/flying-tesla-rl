# 🚀 Roket Araç İniş Simülasyonu: Fizik Denetimi, İtki Analizi ve V4 Yol Haritası

Bu doküman; 120 Hz rijit gövde dinamiği, rampa fırlatması, 360° takla toparlama (barrel roll) ve süpersonik itici frenlemesi içeren **Pekiştirmeli Öğrenme (RL) Uçuş Simülasyonu** projesinin fiziksel fizibilite analizini, mevcut teknik eksiklerini ve bir sonraki sürüm (V4) için geliştirme yol haritasını içerir.

---

## 📌 İçindekiler
1. [Mevcut Uçuş Telemetrisi ve İtki İmpulsu](#1-mevcut-uçuş-telemetrisi-ve-itki-impulsu)
2. [Termodinamik Fizibilite: Soğuk Gaz vs. Sıcak Roket Yakıtı](#2-termodinamik-fizibilite-soğuk-gaz-vs-sıcak-roket-yakıtı)
   - [Tesla Roadster (SpaceX Paketi) Karşılaştırması](#tesla-roadster-spacex-paketi-karşılaştırması)
   - [Sıcak Gaz / Katı Roket (Retro-Rocket) Alternatifi](#sıcak-gaz--katı-roket-retro-rocket-alternatifi)
3. [Mevcut Simülasyonun Eksikleri (Teknik Denetim)](#3-mevcut-simülasyonun-eksikleri-teknik-denetim)
   - [A. Termodinamik & Kütle Dinamiği](#a-termodinamik--kütle-dinamiği)
   - [B. Uçuş Mekaniği (2.5D vs. Tam 6-DOF)](#b-uçuş-mekaniği-25d-vs-tam-6-dof)
   - [C. Yapay Zeka & Kontrol Algoritması](#c-yapay-zeka--kontrol-algoritması)
   - [D. Görselleştirme ve Telemetri (HUD)](#d-görselleştirme-ve-telemetri-hud)
4. [V4 Geliştirme Yol Haritası (Aksiyon Planı)](#4-v4-geliştirme-yol-haritası-aksiyon-planı)

---

## 1. Mevcut Uçuş Telemetrisi ve İtki İmpulsu

Simülasyonun güncel V3 uçuş döngüsü (`feasibility_v3.py` ve `env.py`) çalıştırıldığında elde edilen net değerler:

| Parametre | Değer | Açıklama |
| :--- | :--- | :--- |
| **Araç Boş Kütlesi ($m$)** | $1.800\text{ kg}$ | Standart elektrikli spor araç / Tesla sınıfı |
| **Uçuş Süresi** | $3.32\text{ s}$ | Rampadan ayrılış ile tekerleklerin yere basışı arası |
| **Ana İticilerin Çalışma Süresi** | $2.32\text{ s}$ | Sürekli frenleme ve dikey hız sönümleme süresi |
| **Maksimum Ana İtki Gücü ($T_{max}$)** | $38.847\text{ N}$ | 4 alt itici toplamı (~2.2 TWR) |
| **Ana İtici Toplam İmpulsu ($I_{main}$)** | **$83.096\text{ N}\cdot\text{s}$** | Frenleme için harcanan net itki integrali |
| **RCS Jetleri Toplam İmpulsu ($I_{rcs}$)** | **$16.866\text{ N}\cdot\text{s}$** | 360° burgu ve açısal dengeleme itkisi |
| **Genel Toplam İmpuls ($I_{total}$)** | **$99.962\text{ N}\cdot\text{s}$ (~$100\text{ kN}\cdot\text{s}$)** | Bir iniş manevrası için gereken toplam momentum değişimi |

---

## 2. Termodinamik Fizibilite: Soğuk Gaz vs. Sıcak Roket Yakıtı

Topluluktan gelen *"Bu kadar gazı depolayacak hacim araçta yok, sistem gerçekte çalışmaz"* eleştirisinin fiziksel karşılığı:

### Tesla Roadster (SpaceX Paketi) Karşılaştırması
Tesla ve SpaceX'in Roadster için duyurduğu sistem **Soğuk Gaz İticisi (Cold Gas Thruster)** mantığına dayanır:
* Yakıt: Yüksek basınçlı saf Azot gazı ($N_2$) veya sıkıştırılmış hava.
* Depolama: Arka koltukların yerine yerleştirilen ~700 bar (10.000 psi) COPV (Kompozit Sarımlı Basınçlı Kap) tankı.
* **Özgül İmpuls ($I_{sp}$):** Oda sıcaklığında soğuk azot için yalnızca **$68 - 72\text{ saniye}$**.

Roket itki denkleminden ($I_{total} = m_{propellant} \cdot g_0 \cdot I_{sp}$):
$$m_{gaz} = \frac{I_{total}}{g_0 \cdot I_{sp}} = \frac{100.000\text{ N}\cdot\text{s}}{9.81\text{ m/s}^2 \cdot 70\text{ s}} \approx \mathbf{145.6\text{ kg saf gaz!}}$$

* **Hacim Hesabı:** 700 bar basınçta $N_2$ yoğunluğu $\approx 400\text{ kg/m}^3$ seviyesindedir. $145.6\text{ kg}$ gaz depolamak için **~$364\text{ litre}$** iç hacim gerekir.
* **Tank Ağırlığı:** 700 bar basınca dayanıklı $364\text{ litrelik}$ COPV tankının kendi ağırlığı minimum **$180 - 240\text{ kg}$** civarındadır.
* **Sistem Ağırlığı:** Gaz + Tank + Valfler + Borulama = **$\approx 380 - 420\text{ kg}$**.
* **Sonuç:** Bir spor aracın arka koltuğuna ve bagajına sığabilecek azami COPV kapasitesi ~100-140 litredir (maksimum 25.000 - 30.000 N·s impuls üretir). Dolayısıyla **soğuk gaz kullanılarak 1.8 tonluk aracın 2.3 saniye boyunca havada tutulması hacim ve ağırlık açısından fiziksel olarak imkansızdır.** Eleştiri soğuk gaz varsayımı altında %100 haklıdır.

---

### Sıcak Gaz / Katı Roket (Retro-Rocket) Alternatifi
Eğer bu araç bir "soğuk gazlı araba" değil, Soyuz / Apollo / Starship iniş iticileri gibi bir **katı yakıtlı retro-roket** veya **monopropellant (hidrazin / HTP)** acil durum sistemi olarak ele alınırsa:
* **Özgül İmpuls ($I_{sp}$):** **$250 - 310\text{ saniye}$**
* **Gereken Yakıt Kütlesi:**
  $$m_{yakıt} = \frac{100.000}{9.81 \cdot 280} \approx \mathbf{36.4\text{ kg}}$$
* **Hacim:** Sıvı/katı yoğunluğu $\approx 1000 - 1400\text{ kg/m}^3$ olduğundan gereken tank hacmi **sadece ~30 - 35 litredir** (küçük bir yangın söndürme tüpü boyutunda).
* **Sonuç:** Araç roket kimyası (sıcak itki) bazında tasarlanırsa sistem tamamen uygulanabilir ve taşınabilirdir.

---

## 3. Mevcut Simülasyonun Eksikleri (Teknik Denetim)

### A. Termodinamik & Kütle Dinamiği
1. **Sabit Araç Kütlesi ($m = 1800\text{ kg}$):** Yakıt yandıkça araç hafiflemiyor. Gerçekte $m(t) = m_0 - \dot{m}t$ diferansiyeli işletilmelidir.
2. **Sonsuz Yakıt / Basınç Deposu:** Simülasyonda iticiler sınırsızca tam gaz çalışabilmektedir. Depo basıncının düşmesi (blowdown) veya yakıt tükenmesi modellenmemiştir.
3. **Sürekli İtki vs. Darbe (PWM):** Gerçek hayatta RCS jetleri ve acil durum sönümleyicileri oransal vanalarla sürekli yakmak yerine, yüksek frekanslı anlık darbelerle (Pulse-Width Modulation) minimum yakıtla maksimum tork üretir.

### B. Uçuş Mekaniği (2.5D vs. Tam 6-DOF)
1. **Yaw (Sapma) ve Y Ekseni Yokluğu:** Simülasyon $X$ (ileri/geri), $Z$ (dikey), Pitch ($\theta$) ve Roll ($\phi$) eksenlerini çözmektedir. Ancak $Y$ (yanal sürüklenme) ve Yaw ($\psi$ - pusula açısı) hesaplanmamaktadır.
2. **Zemin Etkisi (Ground Effect):** Araç yere 1.5 metreden daha fazla yaklaştığında egzoz gazlarının pistten sekerek tabana uygulayacağı kaldırma ve türbülans yastığı hesaba katılmamıştır.
3. **Süspansiyon & Lastik Modeli:** Zemin teması basit yay-sönümleyici mantığındadır; tekerlek kayma açısı (slip angle), kamber değişimi ve lastik sürtünme elipsi (Pacejka) bulunmamaktadır.

### C. Yapay Zeka & Kontrol Algoritması
1. **İmitasyon Bağımlılığı (DAgger):** Politika ağı (`RocketCarPolicy`), saf bir Pekiştirmeli Öğrenme (RL) ajanının keşifleriyle değil; analitik bir uzman otopilotun (`ExpertPilot`) aksiyonlarını taklit ederek (Behavior Cloning / DAgger) eğitilmiştir.
2. **Ödül Fonksiyonunda Yakıt Tasarrufu Eksikliği:** Ödül fonksiyonunda itki kullanımını cezalandıran (`-c * total_thrust`) bir yakıt maliyeti terimi zayıftır; bu nedenle ajan yakıtı idareli kullanmak yerine motorlara aşırı yüklenmektedir.
3. **Mükemmel Sensör Varsayımı:** Ajan gözlemleri sıfır hata ile almaktadır. Gerçekte IMU jiroskop kayması (drift), GPS gecikmesi ve barometre gürültüsü bulunur.

### D. Görselleştirme ve Telemetri (HUD)
1. **G-Kuvveti (G-Force) İbresi:** Ani iniş şokunun ve barrel roll dönüşünün yolcu/araç üzerindeki $G$ yükü ekranda gösterilmemektedir.
2. **Kalan Yakıt / Basınç Barı:** HUD üzerinde canlı azalan bir nitrojen/yakıt göstergesi eksiktir.
3. **Plume Toz ve Zemin Aydınlatması:** İticiler ateşlendiğinde yere yansıyan dinamik ışık ve zeminden kalkan toz/duman partikülleri eksiktir.

---

## 4. V4 Geliştirme Yol Haritası (Aksiyon Planı & Uygulanan Çözümler)

### Aşama 1: Gerçekçi Kütle ve Yakıt Modeli ✅ (TAMAMLANDI)
- [x] `params.py` içine `INITIAL_FUEL_MASS = 45.0` (kg), `DRY_MASS = 1800.0` (kg), `ISP_MAIN = 260.0` (s) ve `ISP_RCS = 180.0` (s) tanımlandı.
- [x] `dynamics.py` ve `index.html` içinde her 120 Hz fizik alt adımında yakıt tüketimi ($\dot{m}$) ve araç kütlesi dinamik güncellendi:
  $$\Delta m = \left(\frac{\sum T_{main}}{g_0 \cdot I_{sp,main}} + \frac{\sum |T_{rcs}|}{g_0 \cdot I_{sp,rcs}}\right) \Delta t$$
- [x] Yakıt bittiğinde motor itkileri anında sıfırlandı (Flameout), aracın kütlesi $1800\text{ kg}$ kuru kütleye sabitlendi.

---

### Aşama 2: Gelişmiş Zemin Fiziği (Ground Effect & Coulomb Lastik Sürtünmesi) ✅ (TAMAMLANDI)
- [x] **Zemin Etkisi (Plume Ground Cushion / Multi-Nozzle Fountain Effect):**
  * *Literatür ve Araştırma:* Tek motorlu roketlerde nozul süpersonik çıkışı nedeniyle zemin basıncı nozul içine geri iletilemez; ancak 4 alt nozullu VTOL ve iniş araçlarında (Apollo LM, quad-thruster lander) yere çarpan 4 egzoz jeti araç tabanının ortasında çarpışarak yukarı yönlü yüksek basınçlı bir **"Fountain Effect" (zemin yastığı)** oluşturur. Bu yastık tabana doğrudan aerodinamik kaldırma uygular.
  * *Formülasyon:*
    $$\eta_{ge}(h) = 1.0 + 0.18 \cdot \exp\left(-\frac{h}{0.85}\right) \cdot \cos(\theta) \cdot \cos(\phi)$$
  * $h < 1.8\text{ m}$ altına inildiğinde taban kaldırması azami +%18 artar. Usta pilot ve sinir ağı yere yaklaşırken itkiyi oransal kısarak zıplamayı ve kontrol kaybını engeller.
- [x] **Normal Kuvvete Bağlı Coulomb Lastik Sürtünmesi ($F_{fren} = \mu \cdot F_N$):**
  * Sabit yapay deselerasyon yerine, tekerleklerin anlık süspansiyon yay-sönüm kuvvetine dayalı Coulomb sürtünme sınırı uygulandı:
    $$F_{fren} \le \mu \cdot F_N \quad (\mu = 1.15 \text{ Kuru Asfalt / Yüksek Performanslı Yarış Hamuru})$$
  * Araç havada veya tek tekeri hafif temas halindeyken ($F_N \to 0$) lastikler kayar (drift/slide); 4 tekerlek ağırlığıyla yere oturduğunda ($F_N \approx mg$) mekanik frenleme azami kuvvetine ulaşarak aracı stabilize eder.
- [x] **Basınç Merkezi (CoP) ve 6-DoF Karar Analizi:**
  * *Neden Şimdilik 4-DoF (X, Z, Pitch $\theta$, Roll $\phi$)?* Tam 6-DoF simülasyonu; Yaw ($\psi$), yanal kayma açısı ($\beta$), aerodinamik çapraz moment türevleri ($C_{m,\alpha}, C_{n,\beta}, C_{l,\beta}$) ve 6 ilave yönlendirme RCS jetini gerektirir. Bu durum gözlem uzayını 12 boyuttan 20 boyuta çıkarıp pekiştirmeli öğrenme veri boyutunu ve Three.js WebGL işlem yükünü katlayarak tarayıcıda 60 FPS akıcılığı riske atar. Mevcut 4-DoF modeli; rampa çıkışı, 360° barrel roll, retrograde flare ve yumuşak inişin tüm görsel ve fiziksel zenginliğini milisaniyelik gecikmeyle (%100 akıcı) sunmaktadır.

---

### Aşama 3: HUD Telemetri & Görsel İbreler ✅ (TAMAMLANDI)
- [x] **Canlı G-Meter (G-Force Gauge):** Ani fırlatma, retrograde frenleme ve tekerlek zemin temas ivmelerini canlı gösteren G-Force sayacı telemetri paneline eklendi.
- [x] **Kalan Yakıt & Basınç Barı:** Canlı 45 kg yakıt seviyesini, anlık tüketimini ve alev sönmesini (flameout) dinamik renk değişimiyle (yeşil $\to$ sarı $\to$ kırmızı) yansıtan HUD göstergesi entegre edildi.
- [x] **%100 Saf AI Pilot Modu:** Hibrit/PID asistleri tamamen arındırıldı, tüm butonlar ve telemetri `PİLOT: %100 SAF MODEL` standardına kilitlendi.

---

### Aşama 4: Kaotik Fling & Mouse Savurma Refleks Eğitimi ✅ (TAMAMLANDI)
- [x] Rampa çıkışı, yüksekten ters bırakma (`arenaDropHigh`) ve kaotik fırlatma (`arenaRandomFling`) senaryolarını içeren dengeli veri seti (113,468 adım) toplandı.
- [x] DAgger (Dataset Aggregation) ile modelin kendi uçuş sapmaları ve savrulma hataları simüle edilerek acil kurtarma refleksleri pekiştirildi (toplam 206,112 eğitim adımı).
- [x] Asimetrik kayıp fonksiyonu (Asymmetric Loss) ile modelin motor fren itkisini eksik tahmin etmesi engellendi.
- [x] Eğitilen yeni V4 ağırlıkları doğrudan JavaScript Three.js ortamına (`log_1000000.json` ve `trained_policy.json`) aktarıldı.
