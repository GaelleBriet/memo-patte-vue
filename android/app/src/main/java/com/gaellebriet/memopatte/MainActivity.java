package com.gaellebriet.memopatte;

import android.content.Intent;
import android.os.Bundle;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Recréée ou rouverte depuis les récents, l'activité repart de l'intent qui l'a lancée :
        // sans ce nettoyage, le « C'est fait » d'une notification serait rejoué.
        Intent intent = getIntent();
        if (intent != null && (savedInstanceState != null || launchedFromHistory(intent))) {
            intent.removeExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY);
        }
        super.onCreate(savedInstanceState);
    }

    private static boolean launchedFromHistory(Intent intent) {
        return (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
    }
}
