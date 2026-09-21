function trustConfiguredTv(session, tvHost, log) {
  session.setCertificateVerifyProc((request, callback) => {
    const error = request.verificationResult.replace(/^net::ERR_/, '');
    // 电视在局域网使用自签名证书；仅为配置中的电视 IP 放行证书颁发者/名称错误。
    if (request.hostname === tvHost &&
        ['CERT_AUTHORITY_INVALID', 'CERT_COMMON_NAME_INVALID'].includes(error)) {
      log('warn', 'tv-certificate-exception', { host: tvHost, error });
      callback(0);
    } else {
      callback(-3);
    }
  });
}

module.exports = { trustConfiguredTv };
