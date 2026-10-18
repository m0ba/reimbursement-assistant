package com.haozihao.reimbursement;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(InsetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
