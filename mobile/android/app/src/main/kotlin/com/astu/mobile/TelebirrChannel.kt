package com.astu.mobile

import android.content.Intent
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.fragment.app.FragmentActivity
import com.huawei.ethiopia.pay.sdk.api.core.data.PayInfo
import com.huawei.ethiopia.pay.sdk.api.core.utils.PaymentManager
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/** SDK callbacks are untrusted interaction signals, never payment evidence. */
class TelebirrChannel(private val activity: FragmentActivity, messenger: BinaryMessenger) {
    private val channel = MethodChannel(messenger, "smart_agri/telebirr_uat")
    private val handler = Handler(Looper.getMainLooper())
    private var pending: MethodChannel.Result? = null
    private var interrupted = false
    // Persist only local attempt IDs (never signed payloads), so Activity/process
    // recreation cannot relaunch an already-authorized/ambiguous attempt.
    private val launched = activity.getSharedPreferences("telebirr_uat_attempts", Context.MODE_PRIVATE)
    private val host = "com.ethiotelecom.telebirr.customer.uat"
    private val timeout = Runnable {
        // SDK has no cancellation API or callback attempt ID. After timeout do
        // not launch again in this Activity: a late callback could be misrouted.
        interrupted = true
        finish(mapOf("outcome" to "interrupted"))
    }

    init {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "availability" -> result.success(mapOf("available" to hostAvailable()))
                "startTelebirrPayment" -> {
                    val args = call.arguments as? Map<*, *>
                    val id = args?.get("fundingId") as? String
                    val appId = args?.get("appId") as? String
                    val receiveCode = args?.get("receiveCode") as? String
                    val shortCode = args?.get("shortCode") as? String
                    if (id.isNullOrBlank() || !Regex("[0-9a-fA-F-]{36}").matches(id) ||
                        appId.isNullOrBlank() || receiveCode.isNullOrBlank() || shortCode.isNullOrBlank() ||
                        appId.length > 128 || shortCode.length > 128 || receiveCode.length > 16384) {
                        result.error("INVALID_ARGUMENTS", "Required SDK initialization data is missing", null)
                    } else if (pending != null || interrupted || launched.getBoolean(id, false)) {
                        result.error("PAYMENT_BUSY", "Attempt already launched or interrupted; verify its status", null)
                    } else if (!hostAvailable()) {
                        result.error("HOST_UNAVAILABLE", "Install a compatible official Telebirr UAT testbed", null)
                    } else if (!launched.edit().putBoolean(id, true).commit()) {
                        result.error("ATTEMPT_STORAGE_FAILED", "Cannot safely persist payment attempt", null)
                    } else {
                        pending = result
                        try {
                            val info = PayInfo.Builder().setAppId(appId)
                                .setReceiveCode(receiveCode).setShortCode(shortCode).build()
                            PaymentManager.getInstance().setPayCallback { code, _ ->
                                activity.runOnUiThread {
                                    // Do not return raw provider text: it may contain sensitive data.
                                    val outcome = when (code) {
                                        0 -> "sdk_completed"
                                        -3 -> "cancelled"
                                        -10 -> "host_missing"
                                        -11 -> "host_unsupported"
                                        else -> "sdk_error"
                                    }
                                    finish(mapOf("code" to code, "outcome" to outcome))
                                }
                            }
                            handler.postDelayed(timeout, 180000)
                            PaymentManager.getInstance().pay(activity, info)
                        } catch (_: Exception) {
                            interrupted = true
                            finish(mapOf("outcome" to "launch_error"))
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun hostAvailable(): Boolean = try {
        val info = activity.packageManager.getPackageInfo(host, 0)
        val intent = Intent().setClassName(host, "com.huawei.module_checkout.inapp.PaySdkEnterActivity")
        info.versionCode >= 10100313 && activity.packageManager.resolveActivity(intent, 0) != null
    } catch (_: Exception) { false }

    private fun finish(value: Map<String, Any>) {
        handler.removeCallbacks(timeout)
        PaymentManager.getInstance().setPayCallback(null)
        val result = pending
        pending = null
        result?.success(value)
    }

    fun dispose() {
        finish(mapOf("outcome" to "interrupted"))
        channel.setMethodCallHandler(null)
    }
}
