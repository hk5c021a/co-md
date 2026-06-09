# TLS 证书

本地开发使用 [mkcert](https://github.com/FiloSottile/mkcert) 生成受信任的 TLS 证书。

## 生成证书

```bash
# 安装 mkcert（仅首次）
mkcert -install

# 生成 localhost 证书
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1
```

生成的证书文件（`cert.pem` / `key.pem`）已通过 `.gitignore` 排除，不会提交到仓库。
