FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash coreutils findutils grep sed gawk procps less nano vim-tiny \
        python3 python3-pip openjdk-21-jdk-headless sqlite3 nodejs npm \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 cloudlab \
    && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash cloudlab

WORKDIR /home/cloudlab/workspace
USER 10001:10001

CMD ["/bin/bash", "--noprofile", "--norc"]
