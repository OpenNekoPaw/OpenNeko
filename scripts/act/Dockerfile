ARG ACT_BASE_IMAGE=catthehacker/ubuntu:act-latest
FROM ${ACT_BASE_IMAGE}

USER root

COPY native-build-packages.txt /tmp/openneko-native-build-packages.txt

RUN apt-get update \
    && xargs apt-get install -y < /tmp/openneko-native-build-packages.txt \
    && rm -f /tmp/openneko-native-build-packages.txt \
    && rm -rf /var/lib/apt/lists/*
