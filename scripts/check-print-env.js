// Presence only: never log printer credentials or its serial number.
const aliasUser = process.env.USERKEY || process.env.XPYUN_USERKEY || process.env.SN ? process.env.USER : "";
const config = {
  user: Boolean(process.env.XPYUN_USER || aliasUser),
  userKey: Boolean(process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || process.env.USERKEY),
  sn: Boolean(process.env.XPYUN_SN || process.env.SN)
};
console.log(JSON.stringify({ provider: "xpyun", ...config, cloudBufferSeconds: 120, copies: 1, ok: Object.values(config).every(Boolean) }));
if (!Object.values(config).every(Boolean)) process.exitCode = 1;
