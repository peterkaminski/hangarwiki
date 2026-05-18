# Mobile overflow test page

Short normal link for comparison: [example](https://example.org).

A wikilink that should look normal: [[Should Exist]].

## Long URL as link text (should wrap inside the prose column)

[https://example.org/some/very/long/api/path/that/keeps/going/and/wont/break/without/help/from/css](https://example.org/x)

A bare URL inside a paragraph: https://example.org/another/extremely/long/path/that/should/also/wrap/inside/the/text/block/without/pushing/the/page/wider.

## Wide code block (should scroll horizontally inside the `<pre>`)

```
curl -X POST https://example.org/api/v1/widgets --header "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.long.token.value.here.that.makes.the.line.way.too.wide.for.any.normal.viewport" --data '{"foo": "bar", "baz": "qux"}'
```

## Wide table (should scroll horizontally inside the table block)

| Col A         | Col B         | Col C         | Col D         | Col E         | Col F         | Col G         |
|---------------|---------------|---------------|---------------|---------------|---------------|---------------|
| alpha row one | beta row one  | gamma row one | delta row one | epsilon row 1 | zeta row one  | eta row one   |
| alpha row two | beta row two  | gamma row two | delta row two | epsilon row 2 | zeta row two  | eta row two   |

## Strikethrough

~~This text should render as struck-through.~~

## End
