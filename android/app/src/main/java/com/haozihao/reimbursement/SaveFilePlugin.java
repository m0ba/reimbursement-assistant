package com.haozihao.reimbursement;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.app.DownloadManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.ContextCompat;
import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** 把导出的 PDF / Word / CSV 直接写进系统的「下载」目录，不再弹分享面板。 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    @PluginMethod
    public void openFile(PluginCall call) {
        String uriStr = call.getString("uri");
        String mime = call.getString("mime", "application/octet-stream");
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (uriStr != null && !uriStr.isEmpty()) {
                intent.setDataAndType(Uri.parse(uriStr), mime);
            }
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent downloads = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
                downloads.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(downloads);
                call.resolve();
            } catch (Exception fallback) {
                call.reject("无法打开文件");
            }
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64 = call.getString("base64");
        String mime = call.getString("mime", "application/octet-stream");
        if (fileName == null || fileName.isEmpty() || base64 == null) {
            call.reject("missing arguments");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveToDownloads(bytes, fileName, mime, call);
            } else {
                saveToLegacyDownloads(bytes, fileName, call);
            }
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "save failed" : e.getMessage(), e);
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private void saveToDownloads(byte[] bytes, String fileName, String mime, PluginCall call) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new Exception("insert failed");
        OutputStream out = resolver.openOutputStream(uri);
        if (out == null) throw new Exception("open failed");
        try {
            out.write(bytes);
            out.flush();
        } finally {
            out.close();
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);

        JSObject res = new JSObject();
        res.put("path", "Download/" + fileName);
        res.put("uri", uri.toString());
        call.resolve(res);
    }

    private void saveToLegacyDownloads(byte[] bytes, String fileName, PluginCall call) throws Exception {
        boolean granted = ContextCompat.checkSelfPermission(getContext(), android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
        if (!granted) throw new Exception("no storage permission");

        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("mkdir failed");
        File target = new File(dir, fileName);
        FileOutputStream out = new FileOutputStream(target);
        try {
            out.write(bytes);
            out.flush();
        } finally {
            out.close();
        }

        JSObject res = new JSObject();
        res.put("path", target.getAbsolutePath());
        res.put("uri", Uri.fromFile(target).toString());
        call.resolve(res);
    }
}
