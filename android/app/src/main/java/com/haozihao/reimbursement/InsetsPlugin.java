package com.haozihao.reimbursement;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Android 15 起 WebView 会铺到状态栏下面，这里把系统栏高度换算成 dp 交给页面。 */
@CapacitorPlugin(name = "Insets")
public class InsetsPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        float density = getContext().getResources().getDisplayMetrics().density;
        int top = 0;
        int bottom = 0;
        try {
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            if (insets != null && isEdgeToEdge()) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            }
        } catch (Exception ignored) {
            // 取不到就交给页面的兜底值
        }
        JSObject res = new JSObject();
        res.put("top", Math.round(top / density));
        res.put("bottom", Math.round(bottom / density));
        call.resolve(res);
    }

    /** 只有 WebView 真的铺到屏幕最顶（全面屏）时才补间距，普通机型不重复留白。 */
    private boolean isEdgeToEdge() {
        try {
            int[] location = new int[2];
            getBridge().getWebView().getLocationOnScreen(location);
            return location[1] <= 0;
        } catch (Exception e) {
            return false;
        }
    }
}
