package com.ohmycad.odysseum;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

// Écran fluide : on demande à Android le mode d'affichage le plus rapide (90 / 120 / 144 Hz),
// à la même résolution. Sans ça, beaucoup de téléphones laissent les applis à 60 Hz.
// (Copié dans le projet Android au moment du build : voir .github/workflows/build.yml et tools/build_apk.ps1.)
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    preferHighRefreshRate();
  }

  @Override
  public void onResume() {
    super.onResume();
    preferHighRefreshRate(); // (certains téléphones repassent à 60 Hz après une mise en veille)
  }

  private void preferHighRefreshRate() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
    Display display = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? getDisplay() : getWindowManager().getDefaultDisplay();
    if (display == null) return;
    Display.Mode current = display.getMode();
    Display.Mode best = current;
    for (Display.Mode mode : display.getSupportedModes()) {
      boolean sameSize = mode.getPhysicalWidth() == current.getPhysicalWidth() && mode.getPhysicalHeight() == current.getPhysicalHeight();
      if (sameSize && mode.getRefreshRate() > best.getRefreshRate()) best = mode;
    }
    WindowManager.LayoutParams params = getWindow().getAttributes();
    params.preferredDisplayModeId = best.getModeId();
    params.preferredRefreshRate = best.getRefreshRate();
    getWindow().setAttributes(params);
  }
}
