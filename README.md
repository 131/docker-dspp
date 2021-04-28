Docker stack helper


#Usage sample
```
./stack -f production.yml compile
./stack -f production.yml deploy

```

# Requirements
## yq > 4.6
```
export   VERSION=v4.6.0 BINARY=yq_linux_amd64
sudo wget https://github.com/mikefarah/yq/releases/download/${VERSION}/${BINARY} -O /usr/bin/yq
sudo chmod +x /usr/bin/yq
```

# Credits
* [131](https://github.com/131)


