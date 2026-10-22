"""
Trained Policy Ağırlıklarını log_1000000.json içerisine enjekte eden script.
"""

import json
import os
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def inject_weights():
    trained_path = "hover/logs/trained_policy.json"
    target_log = "hover/logs/log_1000000.json"

    if not os.path.exists(trained_path) or not os.path.exists(target_log):
        print("Hata: Dosyalar bulunamadı.")
        return

    with open(trained_path, "r", encoding="utf-8") as f:
        t_data = json.load(f)

    with open(target_log, "r", encoding="utf-8") as f:
        log_data = json.load(f)

    # Ağırlıkları güncelle
    log_data["network"]["weights"] = t_data["weights"]
    log_data["network"]["val_loss"] = t_data["val_loss"]

    with open(target_log, "w", encoding="utf-8") as f:
        json.dump(log_data, f)

    print(f"✅ Yeni eğitilen sinir ağı ağırlıkları başarıyla {target_log} dosyasına aktarıldı!")

if __name__ == "__main__":
    inject_weights()
