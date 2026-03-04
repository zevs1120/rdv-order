# Device Hard Adaptation Baseline

Last updated: 2026-03-04

## Target devices and baseline sizes

- iPhone 17 Pro
  - Screen resolution (physical): `1206 x 2622`
  - CSS viewport baseline: `402 x 874` (`@3x` inference)
- iPhone 16
  - Screen resolution (physical): `1179 x 2556`
  - CSS viewport baseline: `393 x 852` (`@3x` inference)
- vivo X Fold5
  - Inner screen (physical): `2200 x 2480`
  - Cover screen (physical): `1172 x 2748`
  - CSS viewport baseline:
    - cover: `~391 x 916` (density inference)
    - inner: `~800+` width bucket (tablet/fold inference)
- Xiaomi 14 Ultra
  - Screen resolution (physical): `1440 x 3200`
  - CSS viewport baseline: `412 x 915` (Android flagship density baseline)

## Applied hard-adaptation buckets

- `<= 406px`: iPhone 16 / iPhone 17 Pro / vivo cover-screen compact bucket
- `407px - 430px`: Xiaomi 14 Ultra / Android 412 bucket
- `700px - 980px`: vivo X Fold5 unfolded inner-screen bucket

## Layout guarantees after this patch

- No horizontal overflow on Order core surface (`overflow-x: hidden` + min-width guards)
- Order page uses deterministic 2-column dish grid in all phone buckets
- Sidebar width is fixed per device bucket to prevent squeeze/crop
- Price and Add button are locked in visible trailing area of each dish card
- Bottom cart dock keeps both action buttons visible on narrow screens

## Source references

- Apple iPhone 17 Pro specs: https://support.apple.com/en-mn/122209
- Apple iPhone 16 specs: https://support.apple.com/en-ug/121029
- vivo X Fold5 specs: https://www.vivo.com/en/products/param/x-fold5
- vivo X Fold5 detailed display params: https://www.vivo.com/en/products/param/x-fold5?show=display
- Xiaomi 14 Ultra specs: https://www.mi.com/global/support/article/KA-115787/
